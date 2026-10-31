/**
 * The client side of duel-in-the-dark (contracts/src/Duel): the ship, what a
 * player keeps secret, and the proof each action needs. Shared by the web app
 * and the contract tests so that both play exactly the same way.
 *
 * THE CIRCUITS ARE THE RULES (circuits/duel/src/lib.nr). Every action is a
 * whole-state transition: the public `State` before, the public `State` after,
 * and a proof that the second follows from the first. This module computes
 * `next` with the same rules so that a caller never assembles it by hand, but
 * it is only a convenience: if it ever disagreed with the circuit, proving
 * would fail, not the game.
 *
 * A SECRET IS PLAIN DATA ({room, traps, charge, salt, commitment}), so the app
 * can persist it as is. Nothing here is stateful: every function takes the
 * current state and secret and returns the next ones with the proof, and the
 * caller decides when they become current.
 */
import type {CompiledCircuit, InputMap} from '@noir-lang/noir_js';
import type {ZK, Proof, Hex} from './index.js';
import {randomField} from './field.js';

// ----------------------------------------------------------------------------
// THE SHIP (public map data; the same tables as circuits/duel/src/ship.nr)
// ----------------------------------------------------------------------------

export type Room = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const ROOMS: readonly Room[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const ROOM_NAMES: Record<Room, string> = {
	1: 'Cryo Bay',
	2: 'Bridge',
	3: 'Science Lab',
	4: 'Observation Gantry',
	5: 'Galley',
	6: 'Mess Hall',
	7: 'Cargo Hold',
	8: 'Engine Room',
};

export function deckOf(room: Room): 'upper' | 'lower' {
	return room <= 4 ? 'upper' : 'lower';
}

/** Directed: from this room, the rooms a move reaches. */
export const MOVES: Record<Room, readonly Room[]> = {
	1: [2, 5],
	2: [4, 1, 3],
	3: [2, 8],
	4: [2, 7],
	5: [1, 6, 7],
	6: [7, 5, 8],
	7: [4, 8, 5, 6],
	8: [7, 6, 3],
};

/** Directed: from this room, the rooms a shot can go into (its own included). */
export const SHOTS: Record<Room, readonly Room[]> = {
	1: [1, 2, 4],
	2: [2, 4, 1, 3],
	3: [3, 2, 4],
	4: [4, 2, 7, 5, 6],
	5: [5, 6, 7],
	6: [6, 7, 5],
	7: [7, 6, 5],
	8: [8, 7, 6],
};

export function isRoom(value: number): value is Room {
	return Number.isInteger(value) && value >= 1 && value <= 8;
}
export function canMove(from: number, to: number): boolean {
	return isRoom(from) && isRoom(to) && MOVES[from].includes(to);
}
export function canShoot(from: number, into: number): boolean {
	return isRoom(from) && isRoom(into) && SHOTS[from].includes(into);
}

// ----------------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------------

export const PHASE = {PLAY: 0, SHOT: 1, MOVE_AFTER_SHOT: 2, OVER: 3} as const;
export type Phase = (typeof PHASE)[keyof typeof PHASE];
export const LIVES = 2;
export const ACTION_POINTS = 2;
export const MOVE_COST = 1;
export const SHOOT_COST = 2;

/** A seat's hidden state. `traps` and `charge` are milestone D's; 0 = none. */
export type Hidden = {room: number; traps: [number, number]; charge: number};

export type DuelSecret = Hidden & {
	/** decimal string, so the secret survives JSON */
	salt: string;
	commitment: Hex;
};

/**
 * The public state of a match exactly as the circuits see it, and as the
 * contract's `getState` returns it (same field names, same order).
 */
export type DuelState = {
	commitments: readonly [Hex, Hex];
	hits: readonly [number, number];
	actor: number;
	ap: number;
	phase: number;
	argA: number;
	argB: number;
	sealedRoom: number;
};

export function pack(h: Hidden): bigint {
	return (
		BigInt(h.room) +
		(BigInt(h.traps[0]) << 8n) +
		(BigInt(h.traps[1]) << 16n) +
		(BigInt(h.charge) << 24n)
	);
}

export function hiddenIn(room: number): Hidden {
	return {room, traps: [0, 0], charge: 0};
}

/** The noir_js input for a `State` parameter. */
export function stateInput(s: DuelState): InputMap[string] {
	return {
		commitments: [...s.commitments],
		hits: s.hits.map(String),
		actor: String(s.actor),
		ap: String(s.ap),
		phase: String(s.phase),
		arg_a: String(s.argA),
		arg_b: String(s.argB),
		sealed: String(s.sealedRoom),
	};
}

function hiddenInput(h: Hidden): InputMap[string] {
	return {room: String(h.room), traps: h.traps.map(String), charge: String(h.charge)};
}

// ----------------------------------------------------------------------------
// THE RULES, mirrored (circuits/duel/src/lib.nr is the judge)
// ----------------------------------------------------------------------------

function withCommitment(s: DuelState, seat: number, commitment: Hex): DuelState['commitments'] {
	return seat === 0 ? [commitment, s.commitments[1]] : [s.commitments[0], commitment];
}

export function nextAfterMove(
	s: DuelState,
	from: number,
	to: number,
	newCommitment: Hex,
): DuelState {
	if (!canMove(from, to)) throw new Error(`cannot move from ${from} to ${to}`);
	if (to === s.sealedRoom) throw new Error(`room ${to} is sealed`);
	const commitments = withCommitment(s, s.actor, newCommitment);
	if (s.phase === PHASE.PLAY) {
		if (s.ap < MOVE_COST) throw new Error('not enough action points');
		return {...s, commitments, ap: s.ap - MOVE_COST};
	}
	if (s.phase !== PHASE.MOVE_AFTER_SHOT) throw new Error('not a time to move');
	if (from !== s.argA) throw new Error('must move out of the room it shot from');
	return {...s, commitments, phase: PHASE.PLAY, argA: 0, argB: 0};
}

export function nextAfterShoot(s: DuelState, from: number, target: number): DuelState {
	if (s.phase !== PHASE.PLAY) throw new Error('not a time to shoot');
	if (s.ap < SHOOT_COST) throw new Error('not enough action points');
	if (!canShoot(from, target)) throw new Error(`cannot shoot from ${from} into ${target}`);
	return {...s, ap: s.ap - SHOOT_COST, phase: PHASE.SHOT, argA: from, argB: target};
}

export function nextAfterAnswer(s: DuelState, responderRoom: number): DuelState {
	if (s.phase !== PHASE.SHOT) throw new Error('no shot to answer');
	const responder = 1 - s.actor;
	if (responderRoom !== s.argB) return {...s, phase: PHASE.MOVE_AFTER_SHOT};
	const hits: [number, number] = [s.hits[0], s.hits[1]];
	hits[responder] += 1;
	return {...s, hits, phase: hits[responder] >= LIVES ? PHASE.OVER : PHASE.MOVE_AFTER_SHOT};
}

// ----------------------------------------------------------------------------
// PROVING
// ----------------------------------------------------------------------------

export type DuelCircuits = {
	duel_start: CompiledCircuit;
	duel_move: CompiledCircuit;
	duel_shoot: CompiledCircuit;
	duel_answer_shot: CompiledCircuit;
};

export type Transition = {next: DuelState; proof: Proof};

export function createDuel(zk: ZK, circuits: DuelCircuits) {
	async function secretFor(hidden: Hidden): Promise<DuelSecret> {
		const salt = randomField();
		return {...hidden, salt: salt.toString(), commitment: await zk.commit([pack(hidden), salt])};
	}

	function assertOwn(state: DuelState, seat: number, secret: DuelSecret) {
		if (state.commitments[seat].toLowerCase() !== secret.commitment.toLowerCase())
			throw new Error('this secret does not open the seat commitment');
	}

	return {
		/** The commitment to `hidden`, as the circuits compute it. */
		commit: (hidden: Hidden, salt: bigint) => zk.commit([pack(hidden), salt]),

		/** Start in `room`: the commitment and proof to create or join a match. */
		async start(room: number): Promise<{secret: DuelSecret; proof: Proof}> {
			if (!isRoom(room)) throw new Error(`no such room: ${room}`);
			const secret = await secretFor(hiddenIn(room));
			const proof = await zk.prover(circuits.duel_start).prove({
				hidden_state: hiddenInput(secret),
				salt: secret.salt,
				commitment: secret.commitment,
			});
			return {secret, proof};
		},

		/** Move to `to`, hidden: during play, or the free move after a shot. */
		async move(
			state: DuelState,
			current: DuelSecret,
			to: number,
		): Promise<Transition & {secret: DuelSecret}> {
			assertOwn(state, state.actor, current);
			const secret = await secretFor({...current, room: to});
			const next = nextAfterMove(state, current.room, to, secret.commitment);
			const proof = await zk.prover(circuits.duel_move).prove({
				state: stateInput(state),
				next: stateInput(next),
				hidden_state: hiddenInput(current),
				salt: current.salt,
				new_hidden: hiddenInput(secret),
				new_salt: secret.salt,
			});
			return {next, proof, secret};
		},

		/** Shoot into `target`, revealing the room shot from. */
		async shoot(state: DuelState, current: DuelSecret, target: number): Promise<Transition> {
			assertOwn(state, state.actor, current);
			const next = nextAfterShoot(state, current.room, target);
			const proof = await zk.prover(circuits.duel_shoot).prove({
				state: stateInput(state),
				next: stateInput(next),
				hidden_state: hiddenInput(current),
				salt: current.salt,
				target: String(target),
			});
			return {next, proof};
		},

		/** Answer the shot, truthfully: the proof allows nothing else. */
		async answerShot(state: DuelState, current: DuelSecret): Promise<Transition & {hit: boolean}> {
			assertOwn(state, 1 - state.actor, current);
			const next = nextAfterAnswer(state, current.room);
			const proof = await zk.prover(circuits.duel_answer_shot).prove({
				state: stateInput(state),
				next: stateInput(next),
				hidden_state: hiddenInput(current),
				salt: current.salt,
			});
			return {next, proof, hit: current.room === state.argB};
		},
	};
}

export type Duel = ReturnType<typeof createDuel>;
