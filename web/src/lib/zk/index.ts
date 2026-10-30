/**
 * The app's one prover, loaded on first use.
 *
 * LAZY ON PURPOSE. The prover is several megabytes of wasm (the Noir executor
 * and Barretenberg), and most pages never prove anything. The dynamic import
 * keeps it out of the main bundle; the singleton keeps it to one Barretenberg
 * instance (and its worker) per tab, however many games ask for it.
 *
 * WHERE THE WORK HAPPENS. bb.js runs proving in its own Web Worker, so the page
 * does not freeze while a proof is made; only executing the circuit (building
 * the witness, milliseconds) runs on the calling thread. Without cross-origin
 * isolation (COOP/COEP headers, which static and IPFS hosting cannot set) bb.js
 * proves single-threaded: slower, but correct. See the template's notes on
 * proving performance before relying on threads.
 */
import type {ZK} from 'template-zk-game-circuits';

let zk: Promise<ZK> | undefined;

export function getZK(): Promise<ZK> {
	if (!zk) {
		zk = import('template-zk-game-circuits')
			.then(({createZK}) => createZK())
			.catch((error: unknown) => {
				// Let the next caller retry rather than caching a failed load forever.
				zk = undefined;
				throw error;
			});
	}
	return zk;
}

export async function getCircuits() {
	return (await import('template-zk-game-circuits/circuits')).circuits;
}

export {randomField, FIELD_MODULUS} from 'template-zk-game-circuits/field';
export type {Proof, Hex} from 'template-zk-game-circuits';
