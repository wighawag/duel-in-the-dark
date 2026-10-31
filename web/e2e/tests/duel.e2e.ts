import type {Page} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';

// A whole duel, played by two people in two browser contexts against the
// production build and a real chain: stakes from each account's wallet, every
// turn action from each browser's signer (authorised on first use), and every
// proof made in the page by the wasm prover.
//
// The players start in the Galley and the Cargo Hold, which see into each
// other, are next to each other, and both have a room effect, so the script
// works whoever wins the coin flip. The first player (P) uses its room's
// effect (Stim Rations in the Galley, the Motion Tracker in the Cargo Hold),
// sets a trap where it stands and listens. The second (Q) shoots P (a hit) and
// makes its forced move INTO P's room, onto the trap, which P then sets off (a
// hit, and never on P). Q then shoots its own room, where P still is: the
// second hit, and Q wins.

const PROVING = 120_000;
const NAMES: Record<number, string> = {5: 'Galley', 7: 'Cargo Hold'};

function room(page: Page, n: number) {
	return page.locator(`svg g[data-room="${n}"]`);
}
const turnText = (ap: number) =>
	new RegExp(`Your turn: ${ap} action point${ap === 1 ? '' : 's'} left`);

describe('Duel in the Dark', () => {
	test('two players play a match with an effect, a trap and a listen, to two hits', async ({
		connectedPage,
		connectWallet,
		authoriseBrowser,
		fundWalletAccounts,
		waitForTransaction,
		browser,
	}) => {
		test.setTimeout(15 * 60_000);

		// Player A creates a match, starting in the Galley.
		const a = connectedPage;
		await fundWalletAccounts(a);
		await a.goto('/duel/');
		await room(a, 5).click();
		await a
			.getByRole('button', {name: 'Create, starting in the Galley'})
			.click();
		await connectWallet(a);
		await waitForTransaction(a);
		await expect(
			a.getByRole('button', {name: /Open · 0\.01 ETH · yours/}),
		).toBeVisible({
			timeout: PROVING,
		});

		// Player B, in another browser context, joins it from the Cargo Hold.
		const contextB = await browser.newContext();
		const b = await contextB.newPage();
		await b.goto('/duel/');
		const connect = b.getByRole('button', {name: /^connect$/i}).first();
		await expect(connect).toBeEnabled({timeout: 60_000});
		await connect.click();
		await connectWallet(b);
		await fundWalletAccounts(b);
		await b
			.getByRole('button', {name: /Open · 0\.01 ETH/})
			.first()
			.click();
		await room(b, 7).click();
		await b
			.getByRole('button', {
				name: 'Join, starting in the Cargo Hold (0.01 ETH)',
			})
			.click();
		await connectWallet(b);
		await waitForTransaction(b);

		await a
			.getByRole('button', {name: /Active.*yours/})
			.first()
			.click();
		await expect(b.getByText(/You are seat 1, in the Cargo Hold/)).toBeVisible({
			timeout: PROVING,
		});
		await expect(a.getByText(/You are seat 0, in the Galley/)).toBeVisible({
			timeout: PROVING,
		});

		const whoseTurn = async () =>
			(await a.getByText(turnText(2)).isVisible())
				? 'a'
				: (await b.getByText(turnText(2)).isVisible())
					? 'b'
					: undefined;
		await expect.poll(whoseTurn, {timeout: PROVING}).not.toBe(undefined);
		const aFirst = (await whoseTurn()) === 'a';
		const [p, q] = aFirst ? [a, b] : [b, a];
		const pRoom = aFirst ? 5 : 7;
		const button = (page: Page, name: string) =>
			page.getByRole('button', {name, exact: true});

		// P's room effect, which P's first signed action authorises.
		let pPoints = 2;
		if (pRoom === 5) {
			await button(p, 'Stim Rations').click();
			await authoriseBrowser(p);
			pPoints = 3;
			await expect(p.getByText(turnText(3))).toBeVisible({timeout: PROVING});
		} else {
			// The tracker finds nothing exact on the lower deck: Q names a room
			// next to its own (the first answer is Q's first signed action).
			await button(p, 'Motion Tracker').click();
			await authoriseBrowser(p);
			await expect(q.getByText(/Click the room you name/)).toBeVisible({
				timeout: PROVING,
			});
			await expect(room(q, pRoom)).toHaveAttribute('data-kind', 'reveal');
			await room(q, pRoom).click();
			await authoriseBrowser(q);
			await expect(p.getByTestId('history')).toContainText(
				`They named the ${NAMES[pRoom]}, next to their room.`,
				{timeout: PROVING},
			);
		}
		await expect(p.getByText(turnText(pPoints))).toBeVisible({
			timeout: PROVING,
		});

		// A trap where P stands.
		await button(p, 'Set a trap').click();
		await expect(p.getByTestId('gear')).toContainText(
			`Your traps: the ${NAMES[pRoom]}.`,
			{timeout: PROVING},
		);
		await expect(p.getByText(turnText(pPoints - 1))).toBeVisible({
			timeout: PROVING,
		});

		// A listen: Q must name a room next to its own, and names P's.
		await button(p, 'Listen').click();
		await expect(p.getByText('Waiting for their answer.')).toBeVisible({
			timeout: PROVING,
		});
		await expect(q.getByText(/Click the room you name/)).toBeVisible({
			timeout: PROVING,
		});
		await room(q, pRoom).click();
		if (pRoom === 5) await authoriseBrowser(q);
		await expect(p.getByTestId('history')).toContainText(
			`They named the ${NAMES[pRoom]}, next to their room.`,
			{timeout: PROVING},
		);
		if (pPoints === 3) {
			await expect(p.getByText(turnText(1))).toBeVisible({timeout: PROVING});
			await button(p, 'End turn').click();
		}

		// Q shoots P's room: a hit, which P cannot deny.
		await expect(q.getByText(turnText(2))).toBeVisible({timeout: PROVING});
		await button(q, 'Shoot').click();
		await expect(room(q, pRoom)).toHaveAttribute('data-kind', 'shoot');
		await room(q, pRoom).click();
		const answer = (page: Page) => button(page, 'Answer (proven, truthfully)');
		await expect(answer(p)).toBeVisible({timeout: PROVING});
		await expect(p.getByTestId('status')).toContainText(
			`into the ${NAMES[pRoom]}: answer it`,
		);
		await answer(p).click();

		// Q gave itself away and must move: into P's room, onto the trap.
		await expect(q.getByText(/move out of the room \(free\)/)).toBeVisible({
			timeout: PROVING,
		});
		await expect(q.getByText(/them 1\/2/)).toBeVisible();
		await room(q, pRoom).click();

		// P sets the trap off: Q is hit, P (in the same room) is not.
		await expect(p.getByText(turnText(2))).toBeVisible({timeout: PROVING});
		await button(p, 'Detonate').click();
		await room(p, pRoom).click();
		await expect(answer(q)).toBeVisible({timeout: PROVING});
		await answer(q).click();
		await expect(q.getByTestId('history')).toContainText(
			`They set off a trap in the ${NAMES[pRoom]}.`,
			{timeout: PROVING},
		);
		await expect(q.getByText(/you 1\/2/)).toBeVisible({timeout: PROVING});
		await expect(p.getByText(turnText(1))).toBeVisible({timeout: PROVING});
		await expect(p.getByText(/you 1\/2/)).toBeVisible();
		await expect(p.getByText(/them 1\/2/)).toBeVisible();
		await button(p, 'End turn').click();

		// Q shoots its own room, where P still is: the second hit.
		await expect(q.getByText(turnText(2))).toBeVisible({timeout: PROVING});
		await button(q, 'Shoot').click();
		await room(q, pRoom).click();
		await expect(answer(p)).toBeVisible({timeout: PROVING});
		await answer(p).click();

		await expect(q.getByText('You won the pot.')).toBeVisible({
			timeout: PROVING,
		});
		await expect(p.getByText('You lost.')).toBeVisible({timeout: PROVING});

		await button(q, 'Back to lobby').click();
		await expect(q.getByText(/Winnings and refunds: 0\.02 ETH/)).toBeVisible({
			timeout: PROVING,
		});
		await contextB.close();
	});
});
