import type {Page} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';

// A whole HideAndSeek match, played by two people in two browser contexts
// against the production build and a real chain: stakes from each account's
// wallet, every turn action from each browser's signer (authorised on first
// use), and every proof made in the page by the wasm prover. This is the
// SENDING side the unit tests do not reach.
//
// The burner wallet generates its accounts per browser context, so the second
// context is a second player.

const PROVING = 120_000;

async function pickCell(page: Page, cell: number) {
	await page.locator('svg g[role="button"]').nth(cell).click();
}

describe('Hide and Seek', () => {
	test('two players play a match to the end', async ({
		connectedPage,
		connectWallet,
		authoriseBrowser,
		fundWalletAccounts,
		waitForTransaction,
		browser,
	}) => {
		test.setTimeout(10 * 60_000);

		// Player A creates a match, hiding in cell 2.
		const a = connectedPage;
		await fundWalletAccounts(a);
		await a.goto('/hide-and-seek/');
		await pickCell(a, 2);
		await a.getByRole('button', {name: 'Create, hiding in cell 2'}).click();
		await connectWallet(a);
		await waitForTransaction(a);
		const matchButton = a.getByRole('button', {
			name: /Open · 0\.01 ETH · yours/,
		});
		await expect(matchButton).toBeVisible({timeout: PROVING});

		// Player B, in another browser context, joins it hiding in cell 6.
		const contextB = await browser.newContext();
		const b = await contextB.newPage();
		await b.goto('/hide-and-seek/');
		// What the connectedPage fixture does for player A: connectWallet only walks
		// the dialogs, so the navbar's Connect has to be clicked first.
		const connect = b.getByRole('button', {name: /^connect$/i}).first();
		await expect(connect).toBeEnabled({timeout: 60_000});
		await connect.click();
		await connectWallet(b);
		await fundWalletAccounts(b);
		await b
			.getByRole('button', {name: /Open · 0\.01 ETH/})
			.first()
			.click();
		await pickCell(b, 6);
		await b.getByRole('button', {name: 'Join, hiding in cell 6'}).click();
		await connectWallet(b);
		await waitForTransaction(b);

		// Both now see the match as theirs; one of them has the turn.
		await a
			.getByRole('button', {name: /Active.*yours/})
			.first()
			.click();
		await expect(b.getByText(/You are seat 1, hiding in cell 6/)).toBeVisible({
			timeout: PROVING,
		});
		await expect(a.getByText(/You are seat 0, hiding in cell 2/)).toBeVisible({
			timeout: PROVING,
		});

		const turnText = /Your turn: 2 action/;
		const whoseTurn = async () =>
			(await a.getByText(turnText).isVisible())
				? 'a'
				: (await b.getByText(turnText).isVisible())
					? 'b'
					: undefined;
		await expect.poll(whoseTurn, {timeout: PROVING}).not.toBe(undefined);
		const aHasTurn = (await whoseTurn()) === 'a';
		const [seeker, hider] = aHasTurn ? [a, b] : [b, a];
		const hiderCell = aHasTurn ? 6 : 2;

		// The seeker guesses right. That is a query: it waits for the answer.
		await pickCell(seeker, hiderCell);
		await seeker.getByRole('button', {name: `Guess cell ${hiderCell}`}).click();
		await authoriseBrowser(seeker);
		await expect(
			seeker.getByText(/Waiting for your opponent to answer/),
		).toBeVisible({
			timeout: PROVING,
		});

		// The hider must answer, with a proof: it cannot deny the hit.
		const answer = hider.getByRole('button', {
			name: 'Answer (proven, truthfully)',
		});
		await expect(answer).toBeVisible({timeout: PROVING});
		await answer.click();
		await authoriseBrowser(hider);

		await expect(seeker.getByText('You won the pot.')).toBeVisible({
			timeout: PROVING,
		});
		await expect(hider.getByText('You lost.')).toBeVisible({timeout: PROVING});

		// And the winner can take it.
		await seeker.getByRole('button', {name: 'Back to lobby'}).click();
		await expect(
			seeker.getByText(/Winnings and refunds: 0\.02 ETH/),
		).toBeVisible({
			timeout: PROVING,
		});
		await contextB.close();
	});
});
