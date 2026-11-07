<script lang="ts">
	import DefaultHead from '../../lib/metadata/DefaultHead.svelte';
	import {Button} from '$lib/shadcn/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import {getAppContext} from '$lib';
	import {formatEther, parseEther} from 'viem';
	import Ship from './Ship.svelte';
	import ActivityStatus from './ActivityStatus.svelte';
	import {activityLine} from './lib/activity';
	import {createDuelGame, type MatchSummary} from './lib/game';
	import {
		LIVES,
		ROOM_NAMES,
		actionsFor,
		gearLine,
		pickModeFor,
		queryOf,
		resultLine,
		roleIn,
		sealedNow,
		shipView,
		statusLine,
		turnLine,
		type Intent,
	} from './lib/view';
	import {describe, sightingLine, sightingOf} from './lib/history';

	const game = createDuelGame(getAppContext());
	const {view, activity, history, ending} = game;

	let now = $state(Math.floor(Date.now() / 1000));
	$effect(() => {
		const timer = setInterval(
			() => (now = Math.floor(Date.now() / 1000)),
			1000,
		);
		return () => clearInterval(timer);
	});

	let pickedRoom = $state(1);
	let intent = $state<Intent>('move');
	let stake = $state('0.01');
	let selectedId = $state<bigint | undefined>(undefined);
	let backup = $state('');

	let status = $derived(activityLine($activity));
	let player = $derived($view.step === 'Loaded' ? $view.player : undefined);
	let matches = $derived($view.step === 'Loaded' ? $view.matches : []);
	let selected = $derived(matches.find((m) => m.id === selectedId));
	$effect(() => game.watch(selectedId));
	let busy = $derived(
		$activity.step === 'proving' || $activity.step === 'sending',
	);
	let role = $derived(selected ? roleIn(selected, player, now) : undefined);
	let me = $derived(selected ? game.mySecret(selected, player) : undefined);
	let myRoom = $derived(me?.room);
	let can = $derived(
		selected && role ? actionsFor(selected, role, me) : undefined,
	);
	let mode = $derived(
		selected && role
			? selected.status === 'Open' && role.canJoin
				? 'start'
				: busy
					? 'none'
					: pickModeFor(selected, role, intent, me)
			: 'start',
	);
	let sighting = $derived(sightingOf($history, role?.seat));
	let rooms = $derived(
		shipView({
			match: selected,
			me: selected ? me : undefined,
			mode,
			query: selected && role ? queryOf(selected, role) : undefined,
			seen: sighting.room,
			near: sighting.near,
			selected: mode === 'start' ? pickedRoom : undefined,
		}),
	);
	let sealed = $derived(selected ? sealedNow(selected) : undefined);

	function pick(room: number) {
		if (!selected || mode === 'start') pickedRoom = room;
		else game.pick(selected, mode, room);
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
			Alien against human, somewhere on a dark ship. Your room, traps and charge
			are hidden behind a commitment, and every action is proven. Each turn has
			2 action points: move (1), shoot into a room you can see (2, which gives
			you away and forces a free move), listen (1), set or set off a trap (1),
			or use your room's effect. Two hits and you lose; if nobody has lost when
			the turn limit is reached, fewer hits taken wins, and equal hits are a tie
			that refunds both stakes.
		</p>
	</header>

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
				<p class="text-sm text-muted-foreground" data-testid="gear">
					{gearLine(me)}
					{#if sealed}The {ROOM_NAMES[sealed as keyof typeof ROOM_NAMES]} is sealed.{/if}
					{sightingLine(sighting) ?? ''}
				</p>
			{/if}
			{#if selected.status === 'Active'}
				<p class="text-sm" data-testid="turn">{turnLine(selected, role)}</p>
			{/if}
			<p data-testid="status">
				{statusLine(selected, role, $ending)}
				{#if selected.status === 'Active'}· {role.secondsLeft}s left{/if}
			</p>
			<ActivityStatus line={status} />

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
				{#if role.myTurn && can}
					<div class="flex flex-wrap items-center gap-2">
						<Button
							variant={intent === 'move' ? 'default' : 'outline'}
							disabled={busy || !can.move}
							onclick={() => (intent = 'move')}>Move</Button
						>
						<Button
							variant={intent === 'shoot' ? 'default' : 'outline'}
							disabled={busy || !can.shoot}
							onclick={() => (intent = 'shoot')}>Shoot</Button
						>
						<Button
							variant="outline"
							disabled={busy || !can.listen}
							onclick={() => game.listen(selected)}>Listen</Button
						>
						<Button
							variant={intent === 'replace' ? 'default' : 'outline'}
							disabled={busy || !can.setTrap}
							onclick={() =>
								can?.setTrapReplaces
									? (intent = 'replace')
									: game.setTrap(selected)}>Set a trap</Button
						>
						<Button
							variant={intent === 'detonate' ? 'default' : 'outline'}
							disabled={busy || !can.detonate}
							onclick={() => (intent = 'detonate')}>Detonate</Button
						>
						{#if can.remoteCharge}
							<Button
								variant={intent === 'charge' ? 'default' : 'outline'}
								disabled={busy}
								onclick={() => (intent = 'charge')}
								>Remote Charge{can.chargeNeverGoesOff
									? ' (your last turn: it would never go off)'
									: ''}</Button
							>
						{/if}
						{#if can.coolantPurge}
							<Button
								variant="outline"
								disabled={busy}
								onclick={() => game.coolantPurge(selected)}
								>Coolant Purge</Button
							>
						{/if}
						{#if can.maintenanceChute}
							<Button
								variant="outline"
								disabled={busy}
								onclick={() => game.maintenanceChute(selected)}
								>Maintenance Chute</Button
							>
						{/if}
						{#if can.dropDown}
							<Button
								variant="outline"
								disabled={busy}
								onclick={() => game.dropDown(selected)}>Drop Down</Button
							>
						{/if}
						{#if can.stimRations}
							<Button
								variant="outline"
								disabled={busy}
								onclick={() => game.stimRations(selected)}>Stim Rations</Button
							>
						{/if}
						{#if can.motionTracker}
							<Button
								variant="outline"
								disabled={busy}
								onclick={() => game.motionTracker(selected)}
								>Motion Tracker</Button
							>
						{/if}
						<Button
							variant="outline"
							disabled={busy}
							onclick={() => game.endTurn(selected)}>End turn</Button
						>
						<span class="text-sm text-muted-foreground"
							>Move, Shoot, Detonate and Remote Charge: then click a highlighted
							room</span
						>
					</div>
				{/if}
				{#if role.mustFireCharge}
					<Button disabled={busy} onclick={() => game.fireCharge(selected)}
						>Set off the Remote Charge</Button
					>
				{/if}
				{#if role.mustAnswer}
					{#if mode === 'none'}
						<Button disabled={busy} onclick={() => game.answer(selected)}
							>Answer (proven, truthfully)</Button
						>
					{:else}
						<p class="text-sm">
							{mode === 'reveal'
								? 'Click the room you name (one next to yours).'
								: 'You must move out of the Engine Room: click where to.'}
						</p>
					{/if}
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
			{#if $history.length > 0}
				<ol class="flex flex-col gap-1 text-sm" data-testid="history">
					{#each $history as entry, i (i)}
						<li>{describe(entry, role.seat)}</li>
					{/each}
					{#if selected.status === 'Finished'}
						<li><strong>{resultLine(selected, role, $ending)}</strong></li>
					{/if}
				</ol>
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
			<ActivityStatus line={status} />
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
					{#if r.myTurn || r.mustAnswer || r.mustMoveAfterShot || r.mustFireCharge}
						· <strong>your move</strong>{/if}
				</button>
			{/each}
		</div>
	{/if}

	{#if $view.step === 'Loaded' && $view.balance > 0n}
		<div class="flex items-center gap-3 rounded-lg border p-4">
			<p>Winnings and refunds: {formatEther($view.balance)} ETH</p>
			<Button disabled={busy} onclick={() => game.withdraw()}>Withdraw</Button>
			{#if $activity.step !== 'idle' && $activity.action === 'Withdraw'}
				<ActivityStatus line={status} />
			{/if}
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
