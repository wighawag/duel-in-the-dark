import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';

// Its own account, which no other suite funds, so it starts EMPTY: see
// test/e2e-account-claims.test.ts.
test.use({walletAccountIndex: 4});

const FAUCET_URL = (globalThis as any).process.env.E2E_FAUCET_URL as
	string | undefined;

const PROVING = 120_000;

async function pickCell(page: Page, cell: number) {
	await page.locator('svg g[role="button"]').nth(cell).click();
}

test.describe('A player with no ETH', () => {
	test.skip(!FAUCET_URL, 'no faucet: run through scripts/run-e2e-tests.sh');

	// How a player on a LAN box (or any chain with a faucet) starts: a fresh
	// burner, nothing in it, and "Get ETH" in the insufficient-funds dialog,
	// which claims from the faucet (PUBLIC_FAUCET_API) and carries on. This
	// repo's version of the template's suite, which used the greetings demo:
	// the first thing a player pays for here is a match's stake.
	test('gets ETH from the faucet, and creates a match', async ({
		page,
		connectWallet,
		waitForTransaction,
	}) => {
		test.setTimeout(5 * 60_000);
		const claims: string[] = [];
		page.on('request', (request) => {
			if (request.url().startsWith(FAUCET_URL!)) claims.push(request.url());
		});

		await page.goto('/hide-and-seek/');
		const connect = page.getByRole('button', {name: /^connect$/i}).first();
		await expect(connect).toBeEnabled({timeout: 60_000});
		await connect.click();
		await connectWallet(page, {fund: false});

		await pickCell(page, 2);
		await page.getByRole('button', {name: 'Create, hiding in cell 2'}).click();
		// Walks whatever comes up, the insufficient-funds dialog included: its
		// "Get ETH" is the faucet.
		await connectWallet(page, {fund: false});
		await waitForTransaction(page);
		await expect(
			page.getByRole('button', {name: /Open · 0\.01 ETH · yours/}),
		).toBeVisible({timeout: PROVING});

		expect(claims, 'the faucet should have been asked for ETH').not.toEqual([]);
	});
});
