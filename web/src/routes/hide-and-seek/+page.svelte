<script lang="ts">
	import DefaultHead from '../../lib/metadata/DefaultHead.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import {getAppContext} from '$lib';
	import {formatEther, parseEther} from 'viem';
	import {createHideAndSeekGame, type MatchSummary} from './lib/game';
	import {roleIn, ringLayout} from './lib/view';

	const CELLS = 8;
	const SIZE = 280;
	const game = createHideAndSeekGame(getAppContext());
	const {view, activity} = game;
	const ring = ringLayout(CELLS, SIZE);

	let now = $state(Math.floor(Date.now() / 1000));
	$effect(() => {
		const timer = setInterval(
			() => (now = Math.floor(Date.now() / 1000)),
			1000,
		);
		return () => clearInterval(timer);
	});

	let pickedCell = $state(0);
	let stake = $state('0.01');
	let selectedId = $state<bigint | undefined>(undefined);
	let backup = $state('');

	let player = $derived($view.step === 'Loaded' ? $view.player : undefined);
	let matches = $derived($view.step === 'Loaded' ? $view.matches : []);
	let selected = $derived(matches.find((m) => m.id === selectedId));
	let busy = $derived(
		$activity.step === 'proving' || $activity.step === 'sending',
	);

	function label(m: MatchSummary) {
		return `#${m.id} · ${m.status} · ${formatEther(m.stake)} ETH`;
	}
</script>

<DefaultHead title={'Hide and Seek - a zk match'} />

<section class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold">Hide and Seek</h1>
		<p class="text-muted-foreground">
			Hide in one of 8 cells. Nobody, the contract included, knows which. Each
			turn: 2 actions, to step to a neighbouring cell (proven, still hidden) or
			to guess a cell, which your opponent must answer with a proof. First
			correct guess takes the pot.
		</p>
	</header>

	{#if $activity.step === 'proving' || $activity.step === 'sending'}
		<p class="flex items-center gap-2">
			<Spinner />
			{$activity.action}: {$activity.step}…
		</p>
	{:else if $activity.step === 'done' && $activity.result.status === 'error'}
		<p class="text-destructive">
			{$activity.action} failed: {$activity.result.message}
		</p>
	{:else if $activity.step === 'failed'}
		<p class="text-destructive">
			{$activity.action} failed: {$activity.message}
		</p>
	{/if}

	<svg
		width={SIZE}
		height={SIZE}
		viewBox="0 0 {SIZE} {SIZE}"
		class="self-center"
	>
		<circle
			cx={SIZE / 2}
			cy={SIZE / 2}
			r={SIZE * 0.38}
			class="fill-none stroke-muted"
		/>
		{#each ring as { cell, x, y } (cell)}
			{@const mine = selected
				? game.myCell(selected, player) === cell
				: pickedCell === cell}
			<g
				role="button"
				tabindex="0"
				class="cursor-pointer"
				onclick={() => (pickedCell = cell)}
				onkeydown={(e) => e.key === 'Enter' && (pickedCell = cell)}
			>
				<circle
					cx={x}
					cy={y}
					r="22"
					class={mine
						? 'fill-primary'
						: pickedCell === cell
							? 'fill-accent stroke-primary'
							: 'fill-muted'}
				/>
				<text
					{x}
					{y}
					dy="5"
					text-anchor="middle"
					class="fill-foreground text-sm">{cell}</text
				>
			</g>
		{/each}
	</svg>

	{#if selected}
		{@const role = roleIn(selected, player, now)}
		<div class="flex flex-col gap-3 rounded-lg border p-4">
			<div class="flex items-center justify-between">
				<h2 class="font-medium">Match {label(selected)}</h2>
				<Button variant="outline" onclick={() => (selectedId = undefined)}
					>Back to lobby</Button
				>
			</div>
			{#if role.seat !== undefined}
				<p>
					You are seat {role.seat}, hiding in cell {game.myCell(
						selected,
						player,
					) ?? '? (no secret in this browser)'}.
				</p>
			{/if}

			{#if selected.status === 'Open'}
				{#if role.canJoin}
					<Button
						disabled={busy}
						onclick={() => game.join(selected, pickedCell)}
					>
						Join, hiding in cell {pickedCell} ({formatEther(selected.stake)} ETH)
					</Button>
				{:else if role.canCancel}
					<p>Waiting for an opponent.</p>
					<Button
						variant="outline"
						disabled={busy}
						onclick={() => game.cancel(selected)}>Cancel and refund</Button
					>
				{/if}
			{:else if selected.status === 'Active'}
				<p>
					{#if role.myTurn}Your turn: {selected.actionPoints} action(s) left
					{:else if role.mustAnswer}Your opponent guessed cell {selected.pendingGuess}:
						answer it
					{:else if role.waitingForAnswer}Waiting for your opponent to answer
						your guess of cell {selected.pendingGuess}
					{:else}Your opponent's turn{/if}
					· {role.secondsLeft}s left
				</p>
				{#if role.myTurn}
					<div class="flex flex-wrap gap-2">
						<Button disabled={busy} onclick={() => game.move(selected, -1)}
							>Step back</Button
						>
						<Button disabled={busy} onclick={() => game.move(selected, 1)}
							>Step forward</Button
						>
						<Button
							disabled={busy}
							onclick={() => game.guess(selected, pickedCell)}
							>Guess cell {pickedCell}</Button
						>
						<Button
							variant="outline"
							disabled={busy}
							onclick={() => game.endTurn(selected)}>End turn</Button
						>
					</div>
				{/if}
				{#if role.mustAnswer}
					<Button disabled={busy} onclick={() => game.answer(selected)}
						>Answer (proven, truthfully)</Button
					>
				{/if}
				{#if role.timedOut}
					<Button
						variant="outline"
						disabled={busy}
						onclick={() => game.claimTimeout(selected)}
					>
						Deadline passed: end the match
					</Button>
				{/if}
			{:else if selected.status === 'Finished'}
				<p>
					{role.won
						? 'You won the pot.'
						: role.drawn
							? 'A draw: each stake was refunded.'
							: role.lost
								? 'You lost.'
								: `Seat ${selected.winner} won.`}
				</p>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-3 rounded-lg border p-4">
			<h2 class="font-medium">New match</h2>
			<p>
				Pick your hiding cell on the ring (now: {pickedCell}), and a stake your
				opponent must match.
			</p>
			<label class="flex items-center gap-3">
				Stake (ETH)
				<input class="w-28 rounded border px-2 py-1" bind:value={stake} />
			</label>
			<Button
				disabled={busy}
				onclick={() => game.create(pickedCell, parseEther(stake || '0'))}
			>
				Create, hiding in cell {pickedCell}
			</Button>
		</div>

		<div class="flex flex-col gap-2 rounded-lg border p-4">
			<h2 class="font-medium">Matches</h2>
			{#if $view.step !== 'Loaded'}
				<p class="flex items-center gap-2"><Spinner /> Loading…</p>
			{:else if matches.length === 0}
				<p>No match yet. Create the first one.</p>
			{/if}
			{#each matches as m (m.id)}
				{@const role = roleIn(m, player, now)}
				<button
					class="rounded border px-3 py-2 text-left hover:bg-accent"
					onclick={() => (selectedId = m.id)}
				>
					{label(m)}
					{#if role.seat !== undefined}
						· yours{/if}
					{#if role.myTurn || role.mustAnswer}
						· <strong>your move</strong>{/if}
				</button>
			{/each}
		</div>
	{/if}

	{#if $view.step === 'Loaded' && $view.balance > 0n}
		<div class="flex items-center gap-3 rounded-lg border p-4">
			<p>Winnings and refunds: {formatEther($view.balance)} ETH</p>
			<Button disabled={busy} onclick={() => game.withdraw()}>Withdraw</Button>
		</div>
	{/if}

	<details class="rounded-lg border p-4">
		<summary class="cursor-pointer font-medium"
			>Backup your hidden state</summary
		>
		<p class="my-2 text-sm text-muted-foreground">
			Your cells and salts exist only in this browser. Without them you cannot
			answer or move, and you lose on the next deadline. Copy them somewhere
			safe, or paste a backup to restore.
		</p>
		<textarea
			class="h-24 w-full rounded border p-2 font-mono text-xs"
			bind:value={backup}></textarea>
		<div class="flex gap-2">
			<Button
				variant="outline"
				onclick={async () => (backup = await game.exportSecrets())}
				>Show backup</Button
			>
			<Button variant="outline" onclick={() => game.importSecrets(backup)}
				>Restore from backup</Button
			>
		</div>
	</details>
</section>
