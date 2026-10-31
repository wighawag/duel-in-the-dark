import type {Page} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';

// A whole duel, played by two people in two browser contexts against the
// production build and a real chain: stakes from each account's wallet, every
// turn action from each browser's signer (authorised on first use), and every
// proof made in the page by the wasm prover.
//
// The players start in the Cryo Bay and on the Bridge, which see into each
// other, so whoever gets the turn can win in two shots whatever the coin flip:
// shoot the other's room (hit), make the forced move INTO that room, and after
// the other passes, shoot into one's own room (second hit).

const PROVING = 120_000;
const NAMES: Record<number, string> = {1: 'Cryo Bay', 2: 'Bridge'};

function room(page: Page, n: number) {
	return page.locator(`svg g[data-room="${n}"]`);
}

describe('Duel in the Dark', () => {
	test('two players play a match to two hits', async ({
		connectedPage,
		connectWallet,
		authoriseBrowser,
		fundWalletAccounts,
		waitForTransaction,
		browser,
	}) => {
		test.setTimeout(10 * 60_000);

		// Player A creates a match, starting in the Cryo Bay.
		const a = connectedPage;
		await fundWalletAccounts(a);
		await a.goto('/duel/');
		await room(a, 1).click();
		await a
			.getByRole('button', {name: 'Create, starting in the Cryo Bay'})
			.click();
		await connectWallet(a);
		await waitForTransaction(a);
		await expect(
			a.getByRole('button', {name: /Open · 0\.01 ETH · yours/}),
		).toBeVisible({
			timeout: PROVING,
		});

		// Player B, in another browser context, joins it from the Bridge.
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
		await room(b, 2).click();
		await b
			.getByRole('button', {name: 'Join, starting in the Bridge (0.01 ETH)'})
			.click();
		await connectWallet(b);
		await waitForTransaction(b);

		await a
			.getByRole('button', {name: /Active.*yours/})
			.first()
			.click();
		await expect(b.getByText(/You are seat 1, in the Bridge/)).toBeVisible({
			timeout: PROVING,
		});
		await expect(a.getByText(/You are seat 0, in the Cryo Bay/)).toBeVisible({
			timeout: PROVING,
		});

		const turnText = /Your turn: 2 action points left/;
		const whoseTurn = async () =>
			(await a.getByText(turnText).isVisible())
				? 'a'
				: (await b.getByText(turnText).isVisible())
					? 'b'
					: undefined;
		await expect.poll(whoseTurn, {timeout: PROVING}).not.toBe(undefined);
		const aHasTurn = (await whoseTurn()) === 'a';
		const [shooter, target] = aHasTurn ? [a, b] : [b, a];
		const targetRoom = aHasTurn ? 2 : 1;

		// First shot: a hit, proven by the target, who cannot deny it.
		await shooter.getByRole('button', {name: 'Shoot', exact: true}).click();
		await expect(room(shooter, targetRoom)).toHaveAttribute(
			'data-kind',
			'shoot',
		);
		await room(shooter, targetRoom).click();
		await authoriseBrowser(shooter);
		await expect(shooter.getByText(/waiting for the answer/)).toBeVisible({
			timeout: PROVING,
		});
		const answer = target.getByRole('button', {
			name: 'Answer (proven, truthfully)',
		});
		await expect(answer).toBeVisible({timeout: PROVING});
		await expect(target.getByTestId('status')).toContainText(
			`into the ${NAMES[targetRoom]}: answer it`,
		);
		await answer.click();
		await authoriseBrowser(target);

		// The shooter gave itself away and must move: into the target's room.
		await expect(
			shooter.getByText(/move out of the room \(free\)/),
		).toBeVisible({
			timeout: PROVING,
		});
		await expect(shooter.getByText(/them 1\/2/)).toBeVisible();
		await room(shooter, targetRoom).click();

		// The target passes.
		await expect(target.getByText(turnText)).toBeVisible({timeout: PROVING});
		await expect(target.getByText(/you 1\/2/)).toBeVisible();
		await target.getByRole('button', {name: 'End turn'}).click();

		// Second shot, into the shooter's own room, where the target still is.
		await expect(shooter.getByText(turnText)).toBeVisible({timeout: PROVING});
		await shooter.getByRole('button', {name: 'Shoot', exact: true}).click();
		await room(shooter, targetRoom).click();
		await expect(answer).toBeVisible({timeout: PROVING});
		await answer.click();

		await expect(shooter.getByText('You won the pot.')).toBeVisible({
			timeout: PROVING,
		});
		await expect(target.getByText('You lost.')).toBeVisible({timeout: PROVING});

		await shooter.getByRole('button', {name: 'Back to lobby'}).click();
		await expect(
			shooter.getByText(/Winnings and refunds: 0\.02 ETH/),
		).toBeVisible({
			timeout: PROVING,
		});
		await contextB.close();
	});
});
