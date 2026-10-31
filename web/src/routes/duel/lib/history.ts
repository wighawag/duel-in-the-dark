import {readable, type Readable} from 'svelte/store';
import type {Abi, PublicClient} from 'viem';
import {
	ACTION,
	ENGINE_ROOM,
	GALLEY,
	PHASE,
	ROOM_NAMES,
	type Room,
} from 'duel-in-the-dark-circuits/duel';

/**
 * A match's history: one entry per proven transition, from the contract's
 * `Acted` events. Each says who acted, what (`last`), its public data or
 * answer (`argA`, `argB`), the phase it led to and the score. What a revealed
 * room means is worked out here, never in a component.
 */
export type ActedEvent = {
	seat: number;
	last: number;
	phase: number;
	argA: number;
	argB: number;
	hits: readonly [number, number];
};

export type HistoryEntry = ActedEvent & {
	/** the phase it started from: for an answer, the query it closed */
	asked: number;
	/** the seat that took a hit in this transition, if any */
	hitSeat?: number;
};

export function historyOf(events: readonly ActedEvent[]): HistoryEntry[] {
	let phase: number = PHASE.PLAY;
	let hits: readonly [number, number] = [0, 0];
	return events.map((e) => {
		const hitSeat =
			e.hits[0] > hits[0] ? 0 : e.hits[1] > hits[1] ? 1 : undefined;
		const entry: HistoryEntry = {
			...e,
			asked: phase,
			...(hitSeat === undefined ? {} : {hitSeat}),
		};
		phase = e.phase;
		hits = e.hits;
		return entry;
	});
}

const room = (r: number) => `the ${ROOM_NAMES[r as Room] ?? `room ${r}`}`;

/** One line, in plain words, from `mySeat`'s point of view. */
export function describe(e: HistoryEntry, mySeat: number | undefined): string {
	const mine = e.seat === mySeat;
	const who = mine ? 'You' : 'They';
	const whose = mine ? 'your' : 'their';
	const hit = e.hitSeat !== undefined;
	const hitWho = e.hitSeat === mySeat ? 'You' : 'They';
	switch (e.last) {
		case ACTION.MOVE:
			return `${who} moved.`;
		case ACTION.FORCED_MOVE:
			return `${who} slipped out of the room ${whose} shot gave away.`;
		case ACTION.DROP_DOWN:
			return `${who} dropped down from ${room(e.argA)} to ${room(e.argB)}.`;
		case ACTION.SHOOT:
			return `${who} shot from ${room(e.argA)} into ${room(e.argB)}.`;
		case ACTION.LISTEN:
			return `${who} listened.`;
		case ACTION.SET_TRAP:
			return `${who} set a trap.`;
		case ACTION.DETONATE:
			return `${who} set off a trap in ${room(e.argB)}.`;
		case ACTION.SET_CHARGE:
			return `${who} set a Remote Charge from ${room(e.argA)}.`;
		case ACTION.FIRE_CHARGE:
			return `${mine ? 'Your' : 'Their'} Remote Charge went off in ${room(e.argB)}.`;
		case ACTION.COOLANT_PURGE:
			return `${who} purged ${room(e.argB)} from ${room(e.argA)}: it is sealed.`;
		case ACTION.MAINTENANCE_CHUTE:
			return `${who} opened the Maintenance Chute from ${room(e.argA)}.`;
		case ACTION.STIM_RATIONS:
			return `${who} took Stim Rations in ${room(e.argA)}: 3 action points.`;
		case ACTION.MOTION_TRACKER:
			return `${who} used the Motion Tracker in ${room(e.argA)}.`;
		case ACTION.ANSWER:
			switch (e.asked) {
				case PHASE.SHOT:
				case PHASE.DETONATION:
				case PHASE.CHARGE:
					return hit ? `${hitWho} were hit in ${room(e.argB)}.` : 'A miss.';
				case PHASE.PURGE:
					return hit
						? `${hitWho} were caught in ${room(ENGINE_ROOM)}: hit, and slipped out.`
						: `Nobody was in ${room(ENGINE_ROOM)}.`;
				case PHASE.CHUTE:
					return hit
						? `${hitWho} fell into the sealed ${ROOM_NAMES[ENGINE_ROOM]}: hit, and slipped out.`
						: 'The chute: nothing to hear.';
				case PHASE.TRACKER:
				case PHASE.LISTEN:
					// a tracker on the lower deck is answered as a listen
					return e.asked === PHASE.TRACKER && e.argA === 1
						? `The tracker found ${mine ? 'you' : 'them'} in ${room(e.argB)}.`
						: `${who} named ${room(e.argB)}, next to ${whose} room.`;
			}
			return `${who} answered.`;
	}
	return `${who} acted.`;
}

/** Where `mySeat`'s opponent was last known to be, and what has happened since. */
export type Sighting = {
	/** the room they were last known to be in */
	room?: number;
	/** how many times they may have moved since */
	movesSince: number;
	/** a room next to theirs, named in answer to a listen since then */
	near?: number;
};

export function sightingOf(
	entries: readonly HistoryEntry[],
	mySeat: number | undefined,
): Sighting {
	let s: Sighting = {movesSince: 0};
	if (mySeat === undefined) return s;
	const them = 1 - mySeat;
	const seen = (r: number, movesSince = 0) => (s = {room: r, movesSince});
	const moved = () =>
		(s = {...s, movesSince: s.movesSince + 1, near: undefined});
	for (const e of entries) {
		if (e.seat !== them) continue;
		switch (e.last) {
			case ACTION.MOVE:
			case ACTION.FORCED_MOVE:
				moved();
				break;
			case ACTION.SHOOT:
			case ACTION.COOLANT_PURGE:
			case ACTION.MAINTENANCE_CHUTE:
			case ACTION.STIM_RATIONS:
			case ACTION.MOTION_TRACKER:
			case ACTION.SET_CHARGE:
				seen(e.argA);
				break;
			case ACTION.DROP_DOWN:
				seen(GALLEY);
				break;
			case ACTION.ANSWER:
				if (
					e.asked === PHASE.LISTEN ||
					(e.asked === PHASE.TRACKER && e.argA !== 1)
				)
					s = {...s, near: e.argB};
				else if (e.asked === PHASE.TRACKER) seen(e.argB);
				else if (e.asked === PHASE.PURGE || e.asked === PHASE.CHUTE) {
					// a hit: seen in the Engine Room, then out of it; a silent
					// chute may have moved them
					if (e.hitSeat === them) seen(ENGINE_ROOM, 1);
					else if (e.asked === PHASE.CHUTE) moved();
				} else if (e.hitSeat === them) seen(e.argB);
				break;
		}
	}
	return s;
}

/**
 * The `Acted` events of one match, polled. `watch(undefined)` stops reading.
 */
export function createHistory(params: {
	publicClient: PublicClient;
	contract: () => {address: `0x${string}`; abi: Abi; startBlock?: number};
	fetchInterval?: number;
}): Readable<HistoryEntry[]> & {watch(matchId: bigint | undefined): void} {
	let matchId: bigint | undefined;
	let set: ((v: HistoryEntry[]) => void) | undefined;
	let generation = 0;

	async function fetchOnce() {
		const id = matchId;
		const mine = ++generation;
		if (id === undefined) return set?.([]);
		const c = params.contract();
		const logs = await params.publicClient.getContractEvents({
			address: c.address,
			abi: c.abi,
			eventName: 'Acted',
			args: {matchId: id},
			fromBlock: BigInt(c.startBlock ?? 0),
		});
		if (mine !== generation) return;
		const events = logs.map((l) => {
			const a = (l as unknown as {args: ActedEvent}).args;
			return {
				seat: a.seat,
				last: a.last,
				phase: a.phase,
				argA: a.argA,
				argB: a.argB,
				hits: [a.hits[0], a.hits[1]] as const,
			};
		});
		set?.(historyOf(events));
	}

	const store = readable<HistoryEntry[]>([], (s) => {
		set = s;
		const timer = setInterval(
			() => void fetchOnce().catch(() => {}),
			params.fetchInterval ?? 3_000,
		);
		void fetchOnce().catch(() => {});
		return () => {
			clearInterval(timer);
			set = undefined;
		};
	});
	return {
		subscribe: store.subscribe,
		watch(id) {
			if (id === matchId) return;
			matchId = id;
			set?.([]);
			void fetchOnce().catch(() => {});
		},
	};
}

/** The sighting in one sentence, or nothing when they were never seen. */
export function sightingLine(s: Sighting): string | undefined {
	const parts: string[] = [];
	if (s.room !== undefined) {
		const ago =
			s.movesSince === 0
				? 'and have not moved since'
				: `${s.movesSince} move${s.movesSince === 1 ? '' : 's'} ago`;
		parts.push(`They were last seen in ${room(s.room)}, ${ago}.`);
	}
	if (s.near !== undefined) parts.push(`They are next to ${room(s.near)}.`);
	return parts.length ? parts.join(' ') : undefined;
}
