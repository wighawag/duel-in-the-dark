/**
 * The client side of the reference game (contracts/src/HideAndSeek): what a
 * player keeps secret, and the proof each action needs. Shared by the web app
 * and the contract tests so that both play the game exactly the same way.
 *
 * A SECRET IS PLAIN DATA ({cell, salt, commitment}), so the app can persist it
 * as is. It is the only thing that lets a player keep proving: lose it and the
 * match is lost on the next deadline.
 *
 * Every function takes the CURRENT secret and returns the next one along with
 * the proof; nothing here is stateful, so the caller decides when a new secret
 * becomes current (after its transaction is confirmed, not before).
 */
import type {ZK, Proof, Hex} from './index.js';
import {randomField} from './field.js';
import type {CompiledCircuit} from '@noir-lang/noir_js';

export const CELLS = 8;

export type HideAndSeekSecret = {
	cell: number;
	/** decimal string, so the secret survives JSON */
	salt: string;
	commitment: Hex;
};

export type HideAndSeekCircuits = {
	in_range: CompiledCircuit;
	move_on_ring: CompiledCircuit;
	answer_guess: CompiledCircuit;
};

export function createHideAndSeek(zk: ZK, circuits: HideAndSeekCircuits) {
	async function secretFor(cell: number): Promise<HideAndSeekSecret> {
		const salt = randomField();
		return {cell, salt: salt.toString(), commitment: await zk.commit([BigInt(cell), salt])};
	}

	return {
		/** Hide in `cell`: the commitment and proof to create or join a match. */
		async hide(cell: number): Promise<{secret: HideAndSeekSecret; proof: Proof}> {
			assertCell(cell);
			const secret = await secretFor(cell);
			const proof = await zk.prover(circuits.in_range).prove({
				value: cell.toString(),
				salt: secret.salt,
				max: CELLS.toString(),
				commitment: secret.commitment,
			});
			return {secret, proof};
		},

		/** Step one cell around the ring, hidden. */
		async move(
			current: HideAndSeekSecret,
			direction: 1 | -1,
		): Promise<{secret: HideAndSeekSecret; proof: Proof}> {
			const next = await secretFor((current.cell + direction + CELLS) % CELLS);
			const proof = await zk.prover(circuits.move_on_ring).prove({
				cell: current.cell.toString(),
				salt: current.salt,
				new_cell: next.cell.toString(),
				new_salt: next.salt,
				commitment: current.commitment,
				new_commitment: next.commitment,
			});
			return {secret: next, proof};
		},

		/** Answer the opponent's guess, truthfully: the proof allows nothing else. */
		async answer(current: HideAndSeekSecret, guess: number): Promise<{hit: boolean; proof: Proof}> {
			const hit = current.cell === guess;
			const proof = await zk.prover(circuits.answer_guess).prove({
				cell: current.cell.toString(),
				salt: current.salt,
				commitment: current.commitment,
				guess: guess.toString(),
				hit,
			});
			return {hit, proof};
		},
	};
}

export type HideAndSeek = ReturnType<typeof createHideAndSeek>;

function assertCell(cell: number) {
	if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS)
		throw new Error(`no such cell: ${cell}`);
}
