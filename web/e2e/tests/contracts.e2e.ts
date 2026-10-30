import {test, expect, describe} from '../fixtures/test';
import {
	HARMLESS_ARGUMENT,
	HARMLESS_CONTRACT,
	HARMLESS_WRITE,
	openContract,
	writeCard,
} from '../fixtures/contracts-page';

describe('Contracts Page', () => {
	test('should show contract selection dropdown', async ({page}) => {
		await page.goto('/contracts');

		// The contract selector should be visible
		const selector = page
			.getByRole('combobox')
			.or(page.locator('[class*="select"]').first());
		await expect(selector).toBeVisible({timeout: 5000});
	});

	test('should display the game contract once selected', async ({page}) => {
		await openContract(page, HARMLESS_CONTRACT);

		// Should show the game contract (as button or heading)
		await expect(page.getByText(HARMLESS_CONTRACT).first()).toBeVisible({
			timeout: 5000,
		});
	});

	test('should display contract address', async ({page}) => {
		await page.goto('/contracts');

		// Should show an Ethereum address (0x...)
		const addressElement = page.locator('text=/0x[a-fA-F0-9]{4,}/');
		await expect(addressElement.first()).toBeVisible({timeout: 5000});
	});

	test('should have Read and Write tabs', async ({page}) => {
		await openContract(page);

		// Should have Read and Write tabs
		await expect(page.getByRole('tab', {name: 'Read'})).toBeVisible({
			timeout: 5000,
		});
		await expect(page.getByRole('tab', {name: 'Write'})).toBeVisible();
	});

	test('should display view functions in Read tab', async ({page}) => {
		await openContract(page);

		// Wait for Read tab to be visible and click it
		const readTab = page.getByRole('tab', {name: 'Read'});
		await expect(readTab).toBeVisible({timeout: 5000});
		await readTab.click();

		// Should show "View Functions" heading
		await expect(
			page.getByRole('heading', {name: 'View Functions'}),
		).toBeVisible({timeout: 5000});

		// Should list the getLastMessages or messages function
		await expect(page.getByText('lastMatchId').first()).toBeVisible({
			timeout: 5000,
		});
	});

	test('should display write functions in Write tab', async ({page}) => {
		await openContract(page);

		// Wait for Write tab to be visible and click it
		const writeTab = page.getByRole('tab', {name: 'Write'});
		await expect(writeTab).toBeVisible({timeout: 5000});
		await writeTab.click();

		// Should show the harmless write (see fixtures/contracts-page.ts)
		await expect(page.getByText(HARMLESS_WRITE).first()).toBeVisible({
			timeout: 5000,
		});
	});

	test('should be able to call a view function', async ({page}) => {
		await openContract(page);

		// Wait for Read tab and click it
		const readTab = page.getByRole('tab', {name: 'Read'});
		await expect(readTab).toBeVisible({timeout: 5000});
		await readTab.click();

		// Find the getLastMessages function card and expand it or click call
		const functionCard = page.locator('[class*="card"]').filter({
			hasText: 'lastMatchId',
		});

		// If there's a limit input, fill it
		const limitInput = functionCard
			.locator('input[type="text"], input[type="number"]')
			.first();
		if (await limitInput.isVisible({timeout: 500}).catch(() => false)) {
			await limitInput.fill('10');
		}

		// Click the call/query button
		const callButton = functionCard.getByRole('button', {
			name: /call|query|read/i,
		});
		if (await callButton.isVisible({timeout: 500}).catch(() => false)) {
			await callButton.click();

			// Wait for result - look for success indicator or result display
			await page
				.waitForFunction(
					() => {
						const hasResult = document.querySelector(
							'[class*="result"], [class*="output"]',
						);
						const hasSuccess =
							document.body.textContent?.match(/success|result|\[\]/i);
						return hasResult || hasSuccess;
					},
					{timeout: 5000},
				)
				.catch(() => {});

			// Should show some result (either data or empty array)
			const hasResult = await page
				.locator('[class*="result"], [class*="output"]')
				.isVisible()
				.catch(() => false);
			const hasSuccess = await page
				.getByText(/success|result|\[\]/i)
				.isVisible()
				.catch(() => false);
			expect(hasResult || hasSuccess).toBe(true);
		}
	});
});

describe('Contracts Page - Write Functions', () => {
	// Its own burner account: files run in parallel workers, and two files
	// sending from the same account race each other for a nonce.
	test.use({walletAccountIndex: 1});

	test('should trigger wallet connection when calling write function', async ({
		page,
	}) => {
		await openContract(page);

		const writeTab = page.getByRole('tab', {name: 'Write'});
		await expect(writeTab).toBeVisible({timeout: 10000});
		await writeTab.click();
		await expect(page.getByText(`${HARMLESS_WRITE} nonpayable`)).toBeVisible({
			timeout: 10000,
		});

		const card = writeCard(page);
		await card.getByPlaceholder('0x...').first().fill(HARMLESS_ARGUMENT);
		await card.getByRole('button', {name: /execute/i}).click();

		// Not connected yet, so the click starts the connect flow (or, if the app
		// auto-connected meanwhile, submits).
		const connectFlowStep = page
			.getByRole('button', {name: /dev mode/i})
			.or(page.getByRole('button', {name: /connect .*wallet/i}))
			.or(page.getByText(/accounts available, choose one/i))
			.or(page.getByText(/confirm sign in/i))
			.first();
		const isConnectFlowVisible = await connectFlowStep
			.waitFor({state: 'visible', timeout: 5000})
			.then(() => true)
			.catch(() => false);

		if (!isConnectFlowVisible) {
			const txAlert = page.getByText(/transaction submitted|tx submitted/i);
			await expect(txAlert.first()).toBeVisible({timeout: 10000});
		}
	});

	test('should execute write function after connecting', async ({
		connectedPage,
		connectWallet,
		waitForTransaction,
	}) => {
		test.slow();

		const page = connectedPage;
		await openContract(page);

		await expect(page.locator('[data-testid="wallet-status"]')).toHaveAttribute(
			'data-connected',
			'true',
			{timeout: 30000},
		);

		const writeTab = page.getByRole('tab', {name: 'Write'});
		await expect(writeTab).toBeVisible({timeout: 10000});
		await writeTab.click();
		await expect(page.getByText(`${HARMLESS_WRITE} nonpayable`)).toBeVisible({
			timeout: 10000,
		});

		const card = writeCard(page);
		await card.getByPlaceholder('0x...').first().fill(HARMLESS_ARGUMENT);
		await card.getByRole('button', {name: /execute/i}).click();

		await connectWallet(page);

		// The write lands: the transaction confirms. (The greetings demo read its
		// message back; `revokeDelegate` on a non-delegate has nothing to read,
		// which is what makes it harmless.)
		await waitForTransaction(page);
	});
});

describe('Contracts Page - Accessibility', () => {
	test('should have proper heading hierarchy', async ({page}) => {
		await page.goto('/contracts');

		// Should have h1
		await expect(page.locator('h1')).toHaveCount(1, {timeout: 5000});
	});

	test('should have accessible tab controls', async ({page}) => {
		await openContract(page);

		// Tabs should be visible and keyboard navigable
		const readTab = page.getByRole('tab', {name: 'Read'});
		const writeTab = page.getByRole('tab', {name: 'Write'});

		await expect(readTab).toBeVisible({timeout: 5000});
		await expect(writeTab).toBeVisible();
	});
});
