import {writable, type Readable} from 'svelte/store';
import type {Context} from '$lib/context/types';
import {getZK, getCircuits, randomField, type Proof, type Hex} from '$lib/zk';

/**
 * The template's smallest hidden-information round trip, end to end in the
 * browser: hide a value behind a commitment, prove it is below `max` without
 * revealing it, and have the on-chain verifier accept the proof.
 *
 * The value and salt never leave this store. What a game would publish is the
 * commitment (once, up front) and then the proof and its public inputs.
 */
export type InRangeState =
	| {step: 'idle'}
	| {step: 'committed'; value: number; salt: bigint; commitment: Hex}
	| {step: 'proving'; value: number; salt: bigint; commitment: Hex}
	| {
			step: 'proved';
			value: number;
			salt: bigint;
			commitment: Hex;
			proof: Proof;
			ms: number;
	  }
	| {
			step: 'checked';
			value: number;
			salt: bigint;
			commitment: Hex;
			proof: Proof;
			ms: number;
			onChain: boolean;
	  }
	| {step: 'error'; message: string};

export type InRangeDemo = Readable<InRangeState> & {
	commit(value: number): Promise<void>;
	prove(max: number): Promise<void>;
	verifyOnChain(): Promise<void>;
	reset(): void;
};

export function createInRangeDemo(
	context: Pick<Context, 'publicClient' | 'deployments'>,
): InRangeDemo {
	const store = writable<InRangeState>({step: 'idle'});
	let state: InRangeState = {step: 'idle'};
	store.subscribe((s) => (state = s));

	function fail(error: unknown) {
		store.set({
			step: 'error',
			message: error instanceof Error ? error.message : String(error),
		});
	}

	return {
		subscribe: store.subscribe,

		async commit(value) {
			try {
				const zk = await getZK();
				const salt = randomField();
				const commitment = await zk.commit([BigInt(value), salt]);
				store.set({step: 'committed', value, salt, commitment});
			} catch (error) {
				fail(error);
			}
		},

		async prove(max) {
			if (
				state.step !== 'committed' &&
				state.step !== 'proved' &&
				state.step !== 'checked'
			)
				return;
			const {value, salt, commitment} = state;
			store.set({step: 'proving', value, salt, commitment});
			try {
				const [zk, circuits] = await Promise.all([getZK(), getCircuits()]);
				const start = performance.now();
				const proof = await zk.prover(circuits.in_range).prove({
					value: value.toString(),
					salt: salt.toString(),
					max: max.toString(),
					commitment,
				});
				store.set({
					step: 'proved',
					value,
					salt,
					commitment,
					proof,
					ms: Math.round(performance.now() - start),
				});
			} catch (error) {
				// A value outside the range cannot be proven at all: that IS the
				// guarantee, so it surfaces as an error rather than a false proof.
				fail(error);
			}
		},

		async verifyOnChain() {
			if (state.step !== 'proved' && state.step !== 'checked') return;
			const current = state;
			try {
				const {contracts} = context.deployments.get();
				const onChain = await context.publicClient.readContract({
					...contracts.InRangeVerifier,
					functionName: 'verify',
					args: [current.proof.proof, current.proof.publicInputs],
				});
				store.set({...current, step: 'checked', onChain});
			} catch (error) {
				fail(error);
			}
		},

		reset() {
			store.set({step: 'idle'});
		},
	};
}
