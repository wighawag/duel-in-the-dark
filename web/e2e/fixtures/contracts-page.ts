import {expect, type Page} from '@playwright/test';

/**
 * THE TRANSACTION THE INHERITED SUITES SEND, now that there is no greetings demo.
 *
 * jolly-roger's suites (pending operations, the stalling wallet, the contracts
 * page) needed "some transaction a fresh account can send", and used the demo's
 * `setMessage`. This template does not carry GreetingsRegistry (see
 * .offshoot-omissions), and every game action needs a match and usually a
 * proof. So they send `revokeDelegate(address)` on the game contract instead:
 * any account may call it, it succeeds, and given an address that was never
 * its delegate it changes nothing that matters.
 *
 * Through /contracts, i.e. from the ACCOUNT executor, which is also the route
 * these suites assert.
 */
export const HARMLESS_CONTRACT = 'HideAndSeek';
export const HARMLESS_WRITE = 'revokeDelegate';
/** An address that is nobody's delegate. */
export const HARMLESS_ARGUMENT = '0x000000000000000000000000000000000000dEaD';

/**
 * Open /contracts with `name` selected. The page defaults to the first contract
 * in the deployments, which in this template is a verifier (no writes), so a
 * suite that means the game says so.
 */
export async function openContract(
	page: Page,
	name = HARMLESS_CONTRACT,
): Promise<void> {
	await goToContractsPage(page);
	// The shadcn Select marks its parts with data-slot; bits-ui does not give the
	// trigger a `combobox` role, so a role query finds nothing.
	const trigger = page.locator('[data-slot="select-trigger"]').first();
	await expect(trigger).toBeVisible({timeout: 30_000});
	const current = (await trigger.textContent()) ?? '';
	if (!current.includes(name)) {
		// Exact TEXT, not an anchored regex on the item: an item's text content
		// carries more than its label, and `HideAndSeek_Proxy` must not match.
		const item = page
			.locator('[data-slot="select-item"]')
			.getByText(name, {exact: true});
		// A click during hydration can be swallowed (the handler is not attached
		// yet), leaving the menu shut: retry the opening, as home.e2e.ts does for
		// its links.
		await expect(async () => {
			if (!(await item.isVisible())) await trigger.click();
			await expect(item).toBeVisible({timeout: 2_000});
		}).toPass({timeout: 30_000});
		await item.click();
	}
	await expect(trigger).toContainText(name, {timeout: 10_000});
}

/**
 * Reach /contracts the way a user does once the app is open: a CLIENT-SIDE
 * navigation, not `page.goto`. A full load restarts the app, and account data
 * comes back asynchronously, so a send made straight after it is broadcast but
 * cannot be recorded as an operation ("accountData not ready"): the pending
 * badge never appears and the inspector has nothing to show. A page that is not
 * in the app yet gets the full load, which is then the first load anyway.
 */
async function goToContractsPage(page: Page): Promise<void> {
	if (!page.url().startsWith('http')) {
		await page.goto('/contracts/');
		return;
	}
	// An anchor click is what SvelteKit's router intercepts; retried because a
	// click during hydration can be swallowed.
	await expect(async () => {
		await page.evaluate(() => {
			const a = document.createElement('a');
			a.href = new URL('/contracts/', location.origin).href;
			document.body.appendChild(a);
			a.click();
			a.remove();
		});
		await page.waitForURL(/\/contracts\/?$/, {timeout: 3_000});
	}).toPass({timeout: 15_000});
}

/** The card of `functionName` on the Write tab, which must be open. */
export function writeCard(page: Page, functionName = HARMLESS_WRITE) {
	return page
		.locator('[class*="card"], [class*="function"]')
		.filter({has: page.getByText(`${functionName} nonpayable`)})
		.first();
}

/** Fill and execute the harmless write. The caller handles what follows. */
export async function sendHarmlessWrite(
	page: Page,
	argument = HARMLESS_ARGUMENT,
): Promise<void> {
	await openContract(page);
	const writeTab = page.getByRole('tab', {name: 'Write'});
	await expect(writeTab).toBeVisible({timeout: 30_000});
	await writeTab.click();
	await expect(page.getByText(`${HARMLESS_WRITE} nonpayable`)).toBeVisible({
		timeout: 30_000,
	});
	const card = writeCard(page);
	await card.getByPlaceholder('0x...').first().fill(argument);
	await card.getByRole('button', {name: /execute/i}).click();
}
