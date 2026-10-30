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
 * Works in node and in the browser (bb.js picks the right build). In the
 * browser, run it in a Web Worker: proving blocks for hundreds of milliseconds
 * at least.
 */
import {Noir, type CompiledCircuit, type InputMap} from '@noir-lang/noir_js';
import {Barretenberg, UltraHonkBackend, type BackendOptions} from '@aztec/bb.js';
import {FIELD_MODULUS} from './field.js';

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

export async function createZK(options?: BackendOptions): Promise<ZK> {
	const api = await Barretenberg.new(options);
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
