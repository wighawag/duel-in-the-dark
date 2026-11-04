/**
 * The prover: everything a client or a test needs to turn a circuit artifact
 * and some inputs into a proof the on-chain verifier accepts, plus the
 * commitment hash the circuits check against.
 *
 * ONE BACKEND, ON PURPOSE. The proof, the verification key and the Solidity
 * verifier all come from the same @aztec/bb.js, so they cannot disagree about
 * the proof format. The native `bb` CLI is deliberately not used anywhere: a
 * CLI and a browser prover on two different versions is exactly the mismatch
 * that fails with an unreadable error at proving time.
 *
 * Works in node and in the browser (bb.js picks the right build), offline:
 * the proving setup is committed (crs/), not downloaded. In the
 * browser, run it in a Web Worker: proving blocks for hundreds of milliseconds
 * at least.
 */
import {Noir, type CompiledCircuit, type InputMap} from '@noir-lang/noir_js';
import {Barretenberg, BackendType, UltraHonkBackend, type BackendOptions} from '@aztec/bb.js';
import {FIELD_MODULUS} from './field.js';
import {CRS_G1, CRS_G2} from '../crs/index.js';

export {FIELD_MODULUS, randomField} from './field.js';

export type Hex = `0x${string}`;

/** What a verifier contract's `verify(bytes, bytes32[])` takes. */
export type Proof = {
	proof: Hex;
	publicInputs: Hex[];
};

export type {CompiledCircuit, InputMap};

/**
 * Proofs are generated for the EVM verifier: keccak transcript, zero-knowledge
 * on. Every place that proves, verifies or emits a verifier must use the same
 * target, so it is a constant rather than an option.
 */
const VERIFIER_TARGET = 'evm' as const;

export type Prover = {
	prove(inputs: InputMap): Promise<Proof>;
	verify(proof: Proof): Promise<boolean>;
	verificationKey(): Promise<Uint8Array>;
	solidityVerifier(): Promise<string>;
};

export type ZK = {
	prover(circuit: CompiledCircuit): Prover;
	/** Poseidon2 over BN254 fields, matching `poseidon::poseidon2::Poseidon2::hash` in the circuits. */
	commit(values: readonly (bigint | number)[]): Promise<Hex>;
	destroy(): Promise<void>;
};

/**
 * The proving setup (CRS) the prover is started with: a prefix of the BN254
 * G1 points, uncompressed (64 bytes a point), and the G2 point.
 */
export type CRS = {g1: Uint8Array; g2: Uint8Array};

function fromBase64(s: string): Uint8Array {
	return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** The committed CRS (crs/index.ts): enough for every circuit in this package. */
export function bundledCRS(): CRS {
	return {g1: fromBase64(CRS_G1), g2: fromBase64(CRS_G2)};
}

/**
 * Start the prover. By default it is given the committed CRS (see
 * scripts/crs.ts) and so NEVER downloads anything: bb.js would otherwise fetch
 * 20 MB of points from Aztec's CDN (or, in node, run its native binary, which
 * downloads into ~/.bb-crs), and a game on a LAN with no internet could not
 * prove. That runs bb.js's WASM build in node too, which is fast enough for
 * circuits this size. `crs: false` restores bb.js's own behaviour.
 */
export async function createZK(options?: BackendOptions & {crs?: CRS | false}): Promise<ZK> {
	const {crs = bundledCRS(), ...backend} = options ?? {};
	const api = await Barretenberg.new(
		crs
			? {
					...backend,
					backend: typeof window === 'undefined' ? BackendType.Wasm : BackendType.WasmWorker,
					skipSrsInit: true,
				}
			: backend,
	);
	if (crs) {
		await api.srsInitSrs({pointsBuf: crs.g1, numPoints: crs.g1.length / 64, g2Point: crs.g2});
	}
	const provers = new Map<CompiledCircuit, Prover>();

	function prover(circuit: CompiledCircuit): Prover {
		const existing = provers.get(circuit);
		if (existing) return existing;
		const noir = new Noir(circuit);
		const backend = new UltraHonkBackend(circuit.bytecode, api);
		const created: Prover = {
			async prove(inputs) {
				const {witness} = await noir.execute(inputs);
				const data = await backend.generateProof(witness, {verifierTarget: VERIFIER_TARGET});
				return {proof: bytesToHex(data.proof), publicInputs: data.publicInputs as Hex[]};
			},
			async verify(proof) {
				return backend.verifyProof(
					{proof: hexToBytes(proof.proof), publicInputs: proof.publicInputs},
					{verifierTarget: VERIFIER_TARGET},
				);
			},
			verificationKey() {
				return backend.getVerificationKey({verifierTarget: VERIFIER_TARGET});
			},
			async solidityVerifier() {
				const vk = await backend.getVerificationKey({verifierTarget: VERIFIER_TARGET});
				return backend.getSolidityVerifier(vk, {verifierTarget: VERIFIER_TARGET});
			},
		};
		provers.set(circuit, created);
		return created;
	}

	async function commit(values: readonly (bigint | number)[]): Promise<Hex> {
		const {hash} = await api.poseidon2Hash({inputs: values.map(toField)});
		return bytesToHex(hash);
	}

	return {prover, commit, destroy: () => api.destroy()};
}

function toField(value: bigint | number): Uint8Array {
	let v = BigInt(value);
	if (v < 0n || v >= FIELD_MODULUS) throw new Error(`not a field element: ${value}`);
	const out = new Uint8Array(32);
	for (let i = 31; i >= 0; i--) {
		out[i] = Number(v & 0xffn);
		v >>= 8n;
	}
	return out;
}

function bytesToHex(bytes: Uint8Array): Hex {
	let s = '0x';
	for (const b of bytes) s += b.toString(16).padStart(2, '0');
	return s as Hex;
}

function hexToBytes(hex: Hex): Uint8Array {
	const s = hex.slice(2);
	const out = new Uint8Array(s.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
	return out;
}
