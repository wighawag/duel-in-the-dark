<script lang="ts">
	import DefaultHead from '../../lib/metadata/DefaultHead.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import {getAppContext} from '$lib';
	import {createInRangeDemo} from './lib/inRange';

	const MAX = 8;
	const demo = createInRangeDemo(getAppContext());

	let value = $state(3);
	let max = $state(MAX);
</script>

<DefaultHead title={'ZK - prove without revealing'} />

<section class="mx-auto flex max-w-2xl flex-col gap-6 p-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold">Prove without revealing</h1>
		<p class="text-muted-foreground">
			Hide a number behind a commitment, then prove it is below a limit without
			saying what it is. The proof is made in this browser and checked by the
			verifier contract on chain.
		</p>
	</header>

	<div class="flex flex-col gap-3 rounded-lg border p-4">
		<h2 class="font-medium">1. Commit</h2>
		<label class="flex items-center gap-3">
			Secret value
			<input
				class="w-20 rounded border px-2 py-1"
				type="number"
				min="0"
				bind:value
			/>
		</label>
		<Button onclick={() => demo.commit(value)}>Commit</Button>
		{#if 'commitment' in $demo}
			<p class="font-mono text-xs break-all">commitment: {$demo.commitment}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-3 rounded-lg border p-4">
		<h2 class="font-medium">2. Prove it is below a limit</h2>
		<label class="flex items-center gap-3">
			Limit (public)
			<input
				class="w-20 rounded border px-2 py-1"
				type="number"
				min="1"
				bind:value={max}
			/>
		</label>
		<Button
			disabled={!('commitment' in $demo) || $demo.step === 'proving'}
			onclick={() => demo.prove(max)}
		>
			{#if $demo.step === 'proving'}<Spinner />{/if}
			Prove
		</Button>
		{#if 'proof' in $demo}
			<p>
				Proved in {$demo.ms} ms ({($demo.proof.proof.length - 2) / 2} bytes).
			</p>
		{/if}
	</div>

	<div class="flex flex-col gap-3 rounded-lg border p-4">
		<h2 class="font-medium">3. Verify on chain</h2>
		<Button disabled={!('proof' in $demo)} onclick={() => demo.verifyOnChain()}
			>Verify</Button
		>
		{#if $demo.step === 'checked'}
			<p>
				The verifier contract says:
				<strong>{$demo.onChain ? 'valid' : 'invalid'}</strong>
			</p>
		{/if}
	</div>

	{#if $demo.step === 'error'}
		<div class="rounded-lg border border-destructive p-4 text-destructive">
			<p>{$demo.message}</p>
			<Button variant="outline" onclick={() => demo.reset()}>Start over</Button>
		</div>
	{/if}
</section>
