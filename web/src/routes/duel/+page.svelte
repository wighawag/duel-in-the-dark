<script lang="ts">
	import DefaultHead from '../../lib/metadata/DefaultHead.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import {getAppContext} from '$lib';
	import {formatEther, parseEther} from 'viem';
	import Ship from './Ship.svelte';
	import {createDuelGame, type MatchSummary} from './lib/game';
	import {
		LIVES,
		ROOM_NAMES,
		pickModeFor,
		roleIn,
		shipView,
		statusLine,
	} from './lib/view';

	const game = createDuelGame(getAppContext());
	const {view, activity} = game;

	let now = $state(Math.floor(Date.now() / 1000));
	$effect(() => {
		const timer = setInterval(
			() => (now = Math.floor(Date.now() / 1000)),
			1000,
		);
		return () => clearInterval(timer);
	});

	let pickedRoom = $state(1);
	let intent = $state<'move' | 'shoot'>('move');
	let stake = $state('0.01');
	let selectedId = $state<bigint | undefined>(undefined);
	let backup = $state('');

	let player = $derived($view.step === 'Loaded' ? $view.player : undefined);
	let matches = $derived($view.step === 'Loaded' ? $view.matches : []);
	let selected = $derived(matches.find((m) => m.id === selectedId));
	let busy = $derived(
		$activity.step === 'proving' || $activity.step === 'sending',
	);
	let role = $derived(selected ? roleIn(selected, player, now) : undefined);
	let myRoom = $derived(selected ? game.myRoom(selected, player) : undefined);
	let mode = $derived(
		selected && role
			? selected.status === 'Open' && role.canJoin
				? 'start'
				: busy
					? 'none'
					: pickModeFor(selected, role, intent)
			: 'start',
	);
	let rooms = $derived(
		shipView({
			myRoom: selected ? myRoom : undefined,
			mode,
			shot: role?.shot,
			selected: mode === 'start' ? pickedRoom : undefined,
		}),
	);

	function pick(room: number) {
		if (!selected || mode === 'start') pickedRoom = room;
		else if (mode === 'move') game.move(selected, room);
		else if (mode === 'shoot') game.shoot(selected, room);
	}

	function label(m: MatchSummary) {
		return `#${m.id} · ${m.status} · ${formatEther(m.stake)} ETH`;
	}
</script>

<DefaultHead title={'Duel in the Dark'} />

<section class="mx-auto flex max-w-4xl flex-col gap-6 p-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold">Duel in the Dark</h1>
		<p class="text-muted-foreground">
			Alien against human, somewhere on a dark ship. Your room is hidden behind
			a commitment, and every move is proven. Each turn has 2 action points:
			move to an adjacent room (1), or shoot into a room you can see (2), which
			gives your room away and forces a free move after the answer. Two hits and
			you lose.
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

	<Ship {rooms} onpick={pick} />

	{#if selected && role}
		<div class="flex flex-col gap-3 rounded-lg border p-4">
			<div class="flex items-center justify-between">
				<h2 class="font-medium">Match {label(selected)}</h2>
				<Button variant="outline" onclick={() => (selectedId = undefined)}
					>Back to lobby</Button
				>
			</div>
			{#if role.seat !== undefined && selected.status !== 'Open'}
				<p>
					You are seat {role.seat}, in the {myRoom === undefined
						? '? (no secret in this browser)'
						: ROOM_NAMES[myRoom as keyof typeof ROOM_NAMES]}. Hits taken: you {role.myHits}/{LIVES},
					them {role.theirHits}/{LIVES}.
				</p>
			{/if}
			<p data-testid="status">
				{statusLine(selected, role)}
				{#if selected.status === 'Active'}· {role.secondsLeft}s left{/if}
			</p>

			{#if selected.status === 'Open'}
				{#if role.canJoin}
					<Button
						disabled={busy}
						onclick={() => game.join(selected, pickedRoom)}
					>
						Join, starting in the {ROOM_NAMES[
							pickedRoom as keyof typeof ROOM_NAMES
						]} ({formatEther(selected.stake)} ETH)
					</Button>
				{:else if role.canCancel}
					<Button
						variant="outline"
						disabled={busy}
						onclick={() => game.cancel(selected)}>Cancel and refund</Button
					>
				{/if}
			{:else if selected.status === 'Active'}
				{#if role.myTurn}
					<div class="flex flex-wrap items-center gap-2">
						<Button
							variant={intent === 'move' ? 'default' : 'outline'}
							disabled={busy}
							onclick={() => (intent = 'move')}>Move</Button
						>
						<Button
							variant={intent === 'shoot' ? 'default' : 'outline'}
							disabled={busy || selected.board.ap < 2}
							onclick={() => (intent = 'shoot')}>Shoot</Button
						>
						<Button
							variant="outline"
							disabled={busy}
							onclick={() => game.endTurn(selected)}>End turn</Button
						>
						<span class="text-sm text-muted-foreground"
							>then click a highlighted room</span
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
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-3 rounded-lg border p-4">
			<h2 class="font-medium">New match</h2>
			<p>
				Pick your starting room on the ship (now: the {ROOM_NAMES[
					pickedRoom as keyof typeof ROOM_NAMES
				]}), and a stake your opponent must match.
			</p>
			<label class="flex items-center gap-3">
				Stake (ETH)
				<input class="w-28 rounded border px-2 py-1" bind:value={stake} />
			</label>
			<Button
				disabled={busy}
				onclick={() => game.create(pickedRoom, parseEther(stake || '0'))}
			>
				Create, starting in the {ROOM_NAMES[
					pickedRoom as keyof typeof ROOM_NAMES
				]}
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
				{@const r = roleIn(m, player, now)}
				<button
					class="rounded border px-3 py-2 text-left hover:bg-accent"
					onclick={() => (selectedId = m.id)}
				>
					{label(m)}
					{#if r.seat !== undefined}
						· yours{/if}
					{#if r.myTurn || r.mustAnswer || r.mustMoveAfterShot}
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
			Your rooms and salts exist only in this browser. Without them you cannot
			move, shoot or answer, and you lose on the next deadline. Copy them
			somewhere safe, or paste a backup to restore.
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
