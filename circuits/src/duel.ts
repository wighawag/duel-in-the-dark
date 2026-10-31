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

/** The rooms whose effects the rules name. */
export const CRYO_BAY = 1;
export const SCIENCE_LAB = 3;
export const GANTRY = 4;
export const GALLEY = 5;
export const CARGO_HOLD = 7;
export const ENGINE_ROOM = 8;

// ----------------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------------

/** From QUERY up, the other seat must answer. */
export const PHASE = {
	PLAY: 0,
	MOVE_AFTER_SHOT: 1,
	OVER: 2,
	SHOT: 16,
	LISTEN: 17,
	DETONATION: 18,
	CHARGE: 19,
	PURGE: 20,
	CHUTE: 21,
	TRACKER: 22,
} as const;
export type Phase = (typeof PHASE)[keyof typeof PHASE];
export const QUERY = 16;
export function isQuery(phase: number): boolean {
	return phase >= QUERY;
}

/** What produced a state (`State.last`). */
export const ACTION = {
	NONE: 0,
	MOVE: 1,
	FORCED_MOVE: 2,
	DROP_DOWN: 3,
	SHOOT: 4,
	LISTEN: 5,
	SET_TRAP: 6,
	DETONATE: 7,
	SET_CHARGE: 8,
	FIRE_CHARGE: 9,
	COOLANT_PURGE: 10,
	MAINTENANCE_CHUTE: 11,
	STIM_RATIONS: 12,
	MOTION_TRACKER: 13,
	ANSWER: 14,
} as const;
export type Action = (typeof ACTION)[keyof typeof ACTION];

/** Which verifier `Duel.act` checks a proof with (the contract's numbering). */
export const CIRCUIT = {MOVE: 0, SHOOT: 1, TRAP: 2, EFFECT: 3, ANSWER: 4} as const;
export type CircuitIndex = (typeof CIRCUIT)[keyof typeof CIRCUIT];

export const LIVES = 2;
export const ACTION_POINTS = 2;
export const MOVE_COST = 1;
export const SHOOT_COST = 2;
export const ACTION_COST = 1;

/** A seat's hidden state; 0 = none. */
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
	turn: number;
	acted: number;
	sealedTurn: number;
	tracked: number;
	armed: number;
	last: number;
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
		turn: String(s.turn),
		acted: String(s.acted),
		sealed_turn: String(s.sealedTurn),
		tracked: String(s.tracked),
		armed: String(s.armed),
		last: String(s.last),
	};
}

export function hiddenInput(h: Hidden): InputMap[string] {
	return {room: String(h.room), traps: h.traps.map(String), charge: String(h.charge)};
}

// ----------------------------------------------------------------------------
// PREDICATES (as in circuits/duel/src/lib.nr)
// ----------------------------------------------------------------------------

/** The turn holder has not acted yet this turn. */
export function freshTurn(s: DuelState): boolean {
	return s.acted !== s.turn;
}
/** A seal lasts the rest of the purger's turn and the opponent's next turn. */
export function sealActive(s: DuelState): boolean {
	return s.sealedRoom !== 0 && (s.turn === s.sealedTurn || s.turn === s.sealedTurn + 1);
}
export function roomSealed(s: DuelState, room: number): boolean {
	return sealActive(s) && s.sealedRoom === room;
}
export function isArmed(s: DuelState, seat: number): boolean {
	return seat === 0 ? s.armed === 1 || s.armed === 3 : s.armed >= 2;
}
/** The turn holder's Remote Charge must go off before anything else. */
export function chargeDue(s: DuelState): boolean {
	return isArmed(s, s.actor) && freshTurn(s);
}
function bit(seat: number): number {
	return seat === 0 ? 1 : 2;
}

// ----------------------------------------------------------------------------
// THE RULES, mirrored (circuits/duel/src/lib.nr is the judge)
// ----------------------------------------------------------------------------

function withCommitment(s: DuelState, seat: number, commitment: Hex): DuelState['commitments'] {
	return seat === 0 ? [commitment, s.commitments[1]] : [s.commitments[0], commitment];
}

function ownAction(s: DuelState, action: Action): DuelState {
	if (s.actor > 1) throw new Error('no such seat');
	if (chargeDue(s)) throw new Error('the Remote Charge goes off first');
	return {...s, acted: s.turn, last: action, argA: 0, argB: 0};
}
function pay(s: DuelState, cost: number): number {
	if (s.ap < cost) throw new Error('not enough action points');
	return s.ap - cost;
}
function assertPlay(s: DuelState) {
	if (s.phase !== PHASE.PLAY) throw new Error('not a time to act');
}

export type MoveAction = typeof ACTION.MOVE | typeof ACTION.FORCED_MOVE | typeof ACTION.DROP_DOWN;

/** The move action that takes `from` to `to` in `s`, or an error. */
export function moveActionFor(s: DuelState, from: number, to: number): MoveAction {
	if (s.phase === PHASE.MOVE_AFTER_SHOT) return ACTION.FORCED_MOVE;
	if (from === GANTRY && to === GALLEY) return ACTION.DROP_DOWN;
	return ACTION.MOVE;
}

export function nextAfterMove(
	s: DuelState,
	from: number,
	to: number,
	newCommitment: Hex,
	action: MoveAction = moveActionFor(s, from, to),
): DuelState {
	const next = ownAction(s, action);
	if (roomSealed(s, to)) throw new Error(`room ${to} is sealed`);
	next.commitments = withCommitment(s, s.actor, newCommitment);
	if (action === ACTION.MOVE) {
		assertPlay(s);
		if (!canMove(from, to)) throw new Error(`cannot move from ${from} to ${to}`);
		next.ap = pay(s, MOVE_COST);
	} else if (action === ACTION.FORCED_MOVE) {
		if (s.phase !== PHASE.MOVE_AFTER_SHOT) throw new Error('no move is owed');
		if (from !== s.argA) throw new Error('must move out of the room it shot from');
		if (!canMove(from, to)) throw new Error(`cannot move from ${from} to ${to}`);
		next.phase = PHASE.PLAY;
	} else {
		assertPlay(s);
		if (from !== GANTRY || to !== GALLEY)
			throw new Error('the drop is from the Gantry to the Galley');
		next.argA = GANTRY;
		next.argB = GALLEY;
	}
	return next;
}

export function nextAfterShoot(s: DuelState, from: number, target: number): DuelState {
	const next = ownAction(s, ACTION.SHOOT);
	if (s.phase !== PHASE.PLAY) throw new Error('not a time to shoot');
	next.ap = pay(s, SHOOT_COST);
	if (!canShoot(from, target)) throw new Error(`cannot shoot from ${from} into ${target}`);
	return {...next, phase: PHASE.SHOT, argA: from, argB: target};
}

export type TrapAction =
	| typeof ACTION.SET_TRAP
	| typeof ACTION.DETONATE
	| typeof ACTION.SET_CHARGE
	| typeof ACTION.FIRE_CHARGE;

/**
 * A trap action's next state (the actor's commitment still to be replaced)
 * and the actor's new hidden state. `room`: for SET_TRAP with two traps set,
 * the one to replace; for DETONATE, the trap's; for SET_CHARGE, the target.
 */
export function nextAfterTrap(
	s: DuelState,
	h: Hidden,
	action: TrapAction,
	room = 0,
): {next: DuelState; hidden: Hidden} {
	assertPlay(s);
	const hidden: Hidden = {room: h.room, traps: [h.traps[0], h.traps[1]], charge: h.charge};
	let next: DuelState;
	if (action === ACTION.FIRE_CHARGE) {
		if (!chargeDue(s)) throw new Error('the Remote Charge is not due');
		if (h.charge === 0) throw new Error('no Remote Charge set');
		hidden.charge = 0;
		next = {
			...s,
			armed: s.armed - bit(s.actor),
			phase: PHASE.CHARGE,
			last: ACTION.FIRE_CHARGE,
			argA: 0,
			argB: h.charge,
		};
	} else {
		next = ownAction(s, action);
		next.ap = pay(s, ACTION_COST);
		const [a, b] = h.traps;
		const here = h.room;
		if (action === ACTION.SET_TRAP) {
			if (a === here || b === here) throw new Error('already a trap here');
			if (a === 0) hidden.traps = [here, b];
			else if (b === 0) hidden.traps = [a, here];
			else if (room === a) hidden.traps = [here, b];
			else if (room === b) hidden.traps = [a, here];
			else throw new Error('no such trap to replace');
		} else if (action === ACTION.DETONATE) {
			if (room === 0) throw new Error('no trap there');
			if (room === a) hidden.traps = [0, b];
			else if (room === b) hidden.traps = [a, 0];
			else throw new Error('no trap there');
			next.phase = PHASE.DETONATION;
			next.argB = room;
		} else {
			if (here !== ENGINE_ROOM) throw new Error('not in the Engine Room');
			if (h.charge !== 0 || isArmed(s, s.actor)) throw new Error('a Remote Charge is already set');
			if (!isRoom(room) || room === ENGINE_ROOM) throw new Error('not a room for the charge');
			hidden.charge = room;
			next.armed = s.armed + bit(s.actor);
			next.argA = ENGINE_ROOM;
		}
	}
	return {next, hidden};
}

export type EffectAction =
	| typeof ACTION.LISTEN
	| typeof ACTION.COOLANT_PURGE
	| typeof ACTION.MAINTENANCE_CHUTE
	| typeof ACTION.STIM_RATIONS
	| typeof ACTION.MOTION_TRACKER;

/** Where each room effect is used from. */
export const EFFECT_ROOM: Record<Exclude<EffectAction, typeof ACTION.LISTEN>, number> = {
	[ACTION.COOLANT_PURGE]: CRYO_BAY,
	[ACTION.MAINTENANCE_CHUTE]: SCIENCE_LAB,
	[ACTION.STIM_RATIONS]: GALLEY,
	[ACTION.MOTION_TRACKER]: CARGO_HOLD,
};

/** `here` is the actor's room (unused by LISTEN). */
export function nextAfterEffect(s: DuelState, here: number, action: EffectAction): DuelState {
	const next = ownAction(s, action);
	assertPlay(s);
	if (action === ACTION.LISTEN) return {...next, ap: pay(s, ACTION_COST), phase: PHASE.LISTEN};
	if (here !== EFFECT_ROOM[action]) throw new Error(`not in room ${EFFECT_ROOM[action]}`);
	next.argA = here;
	switch (action) {
		case ACTION.COOLANT_PURGE:
			return {
				...next,
				ap: pay(s, ACTION_COST),
				sealedRoom: ENGINE_ROOM,
				sealedTurn: s.turn,
				phase: PHASE.PURGE,
				argB: ENGINE_ROOM,
			};
		case ACTION.MAINTENANCE_CHUTE:
			return {...next, ap: pay(s, ACTION_COST), phase: PHASE.CHUTE, argB: GALLEY};
		case ACTION.STIM_RATIONS:
			if (!freshTurn(s)) throw new Error('only at the start of the turn');
			return {...next, ap: s.ap + 1};
		case ACTION.MOTION_TRACKER:
			if (s.tracked === s.turn) throw new Error('once per turn');
			return {...next, tracked: s.turn, phase: PHASE.TRACKER};
	}
	throw new Error('not an effect');
}

/** What an answer needs from the responder beyond its secret, if anything. */
export type AnswerChoice = {
	/** where to go when a hit forces a move out of the Engine Room */
	to?: number;
	/** the room a listen names */
	reveal?: number;
};

/**
 * What the responder in room `room` may or must choose to answer the query in
 * `s`: the rooms it may name, or the rooms it may flee to; none when the
 * answer is determined.
 */
export function answerOptions(
	s: DuelState,
	room: number,
): {kind: 'reveal'; rooms: number[]} | {kind: 'flee'; rooms: number[]} | {kind: 'none'} {
	const outOfEngineRoom = () => MOVES[ENGINE_ROOM].filter((r) => !roomSealed(s, r)) as number[];
	switch (s.phase) {
		case PHASE.LISTEN:
			return {kind: 'reveal', rooms: isRoom(room) ? [...MOVES[room]] : []};
		case PHASE.TRACKER:
			if (room <= 4) return {kind: 'none'};
			return {kind: 'reveal', rooms: isRoom(room) ? [...MOVES[room]] : []};
		case PHASE.PURGE:
			return room === ENGINE_ROOM ? {kind: 'flee', rooms: outOfEngineRoom()} : {kind: 'none'};
		case PHASE.CHUTE:
			return room === GALLEY && roomSealed(s, ENGINE_ROOM)
				? {kind: 'flee', rooms: outOfEngineRoom()}
				: {kind: 'none'};
		default:
			return {kind: 'none'};
	}
}

/**
 * The answer's next state (the responder's commitment still to be replaced
 * when `hidden` is not null), whether it was a hit, and the room it names.
 */
export function nextAfterAnswer(
	s: DuelState,
	h: Hidden,
	choice: AnswerChoice = {},
): {next: DuelState; hidden: Hidden | null; hit: boolean; reveal: number} {
	const q = s.phase;
	if (q < QUERY || q > PHASE.TRACKER) throw new Error('no query to answer');
	const responder = 1 - s.actor;
	const room = h.room;
	const next: DuelState = {...s, last: ACTION.ANSWER, phase: PHASE.PLAY};
	let hidden: Hidden | null = null;
	let hit = false;
	let reveal = 0;
	const fleeTo = () => {
		const to = choice.to ?? 0;
		if (!canMove(ENGINE_ROOM, to)) throw new Error('must move out of the Engine Room');
		if (roomSealed(s, to)) throw new Error('the room is sealed');
		return {...h, room: to};
	};
	if (q === PHASE.SHOT || q === PHASE.DETONATION || q === PHASE.CHARGE) {
		hit = room === s.argB;
		if (q === PHASE.SHOT) next.phase = PHASE.MOVE_AFTER_SHOT;
	} else if (q === PHASE.PURGE) {
		hit = room === ENGINE_ROOM;
		if (hit) hidden = fleeTo();
	} else if (q === PHASE.CHUTE) {
		const dropped = room === GALLEY;
		hit = dropped && roomSealed(s, ENGINE_ROOM);
		hidden = hit ? fleeTo() : {...h, room: dropped ? ENGINE_ROOM : room};
	} else {
		const exact = q === PHASE.TRACKER && room <= 4;
		reveal = exact ? room : (choice.reveal ?? 0);
		if (!exact && !canMove(room, reveal)) throw new Error('not a room next to yours');
		next.argA = exact ? 1 : 0;
		next.argB = reveal;
	}
	if (hit) {
		const hits: [number, number] = [s.hits[0], s.hits[1]];
		hits[responder] += 1;
		next.hits = hits;
		if (hits[responder] >= LIVES) next.phase = PHASE.OVER;
	}
	return {next, hidden, hit, reveal};
}

// ----------------------------------------------------------------------------
// PROVING
// ----------------------------------------------------------------------------

export type DuelCircuits = {
	duel_start: CompiledCircuit;
	duel_move: CompiledCircuit;
	duel_shoot: CompiledCircuit;
	duel_trap: CompiledCircuit;
	duel_effect: CompiledCircuit;
	duel_answer: CompiledCircuit;
};

/** What `Duel.act` takes: which verifier, the claimed next state, the proof. */
export type Transition = {circuit: CircuitIndex; next: DuelState; proof: Proof};

/** A transition that replaced the prover's commitment: the secret behind it. */
export type SecretTransition = Transition & {secret: DuelSecret};

const NO_SECRET: Hidden & {salt: string} = {...hiddenIn(0), salt: '0'};

export function createDuel(zk: ZK, circuits: DuelCircuits) {
	async function secretFor(hidden: Hidden): Promise<DuelSecret> {
		const salt = randomField();
		return {...hidden, salt: salt.toString(), commitment: await zk.commit([pack(hidden), salt])};
	}

	function assertOwn(state: DuelState, seat: number, secret: DuelSecret) {
		if (state.commitments[seat].toLowerCase() !== secret.commitment.toLowerCase())
			throw new Error('this secret does not open the seat commitment');
	}

	async function trap(
		state: DuelState,
		current: DuelSecret,
		action: TrapAction,
		room = 0,
	): Promise<SecretTransition> {
		assertOwn(state, state.actor, current);
		const r = nextAfterTrap(state, current, action, room);
		const secret = await secretFor(r.hidden);
		const next = {...r.next, commitments: withCommitment(r.next, state.actor, secret.commitment)};
		const proof = await zk.prover(circuits.duel_trap).prove({
			state: stateInput(state),
			next: stateInput(next),
			hidden_state: hiddenInput(current),
			salt: current.salt,
			new_hidden: hiddenInput(secret),
			new_salt: secret.salt,
			action: String(action),
			room: String(room),
		});
		return {circuit: CIRCUIT.TRAP, next, proof, secret};
	}

	async function effect(
		state: DuelState,
		current: (Hidden & {salt: string; commitment?: Hex}) | null,
		action: EffectAction,
	): Promise<Transition> {
		const witness = current ?? NO_SECRET;
		if (current && action !== ACTION.LISTEN) assertOwn(state, state.actor, current as DuelSecret);
		const next = nextAfterEffect(state, witness.room, action);
		const proof = await zk.prover(circuits.duel_effect).prove({
			state: stateInput(state),
			next: stateInput(next),
			hidden_state: hiddenInput(witness),
			salt: witness.salt,
			action: String(action),
		});
		return {circuit: CIRCUIT.EFFECT, next, proof};
	}

	async function move(
		state: DuelState,
		current: DuelSecret,
		to: number,
		action: MoveAction,
	): Promise<SecretTransition> {
		assertOwn(state, state.actor, current);
		const secret = await secretFor({...current, room: to});
		const next = nextAfterMove(state, current.room, to, secret.commitment, action);
		const proof = await zk.prover(circuits.duel_move).prove({
			state: stateInput(state),
			next: stateInput(next),
			hidden_state: hiddenInput(current),
			salt: current.salt,
			new_hidden: hiddenInput(secret),
			new_salt: secret.salt,
			action: String(action),
		});
		return {circuit: CIRCUIT.MOVE, next, proof, secret};
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

		/** Move to `to`, hidden: during play, or the free move owed after a shot. */
		move: (state: DuelState, current: DuelSecret, to: number) =>
			move(
				state,
				current,
				to,
				state.phase === PHASE.MOVE_AFTER_SHOT ? ACTION.FORCED_MOVE : ACTION.MOVE,
			),

		/** Drop Down: from the Observation Gantry to the Galley, for free. */
		dropDown: (state: DuelState, current: DuelSecret) =>
			move(state, current, GALLEY, ACTION.DROP_DOWN),

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
			return {circuit: CIRCUIT.SHOOT, next, proof};
		},

		/** Set a trap here; with two set, `replace` names the one it replaces. */
		setTrap: (state: DuelState, current: DuelSecret, replace = 0) =>
			trap(state, current, ACTION.SET_TRAP, replace),
		/** Detonate the trap in `room`, revealing it. */
		detonate: (state: DuelState, current: DuelSecret, room: number) =>
			trap(state, current, ACTION.DETONATE, room),
		/** From the Engine Room, a Remote Charge into `room`, hidden. */
		remoteCharge: (state: DuelState, current: DuelSecret, room: number) =>
			trap(state, current, ACTION.SET_CHARGE, room),
		/** The Remote Charge goes off (forced, at the start of the next turn). */
		fireCharge: (state: DuelState, current: DuelSecret) =>
			trap(state, current, ACTION.FIRE_CHARGE, 0),

		/** Listen: the other seat names a room next to its own. No secret needed. */
		listen: (state: DuelState) => effect(state, null, ACTION.LISTEN),
		coolantPurge: (state: DuelState, current: DuelSecret) =>
			effect(state, current, ACTION.COOLANT_PURGE),
		maintenanceChute: (state: DuelState, current: DuelSecret) =>
			effect(state, current, ACTION.MAINTENANCE_CHUTE),
		stimRations: (state: DuelState, current: DuelSecret) =>
			effect(state, current, ACTION.STIM_RATIONS),
		motionTracker: (state: DuelState, current: DuelSecret) =>
			effect(state, current, ACTION.MOTION_TRACKER),

		/**
		 * Answer the pending query, truthfully: the proof allows nothing else.
		 * `choice` carries what the rules leave to the responder (see
		 * `answerOptions`). `secret` is the responder's secret afterwards: new
		 * when the answer replaced its commitment, else the same one.
		 */
		async answer(
			state: DuelState,
			current: DuelSecret,
			choice: AnswerChoice = {},
		): Promise<SecretTransition & {hit: boolean}> {
			const responder = 1 - state.actor;
			assertOwn(state, responder, current);
			const r = nextAfterAnswer(state, current, choice);
			const secret = r.hidden ? await secretFor(r.hidden) : current;
			const next = r.hidden
				? {...r.next, commitments: withCommitment(r.next, responder, secret.commitment)}
				: r.next;
			const proof = await zk.prover(circuits.duel_answer).prove({
				state: stateInput(state),
				next: stateInput(next),
				hidden_state: hiddenInput(current),
				salt: current.salt,
				new_hidden: hiddenInput(secret),
				new_salt: secret.salt,
				reveal: String(r.reveal),
			});
			return {circuit: CIRCUIT.ANSWER, next, proof, secret, hit: r.hit};
		},
	};
}

export type Duel = ReturnType<typeof createDuel>;
