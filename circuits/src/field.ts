/**
 * Field helpers with no dependency on the prover, so an app can draw salts and
 * check inputs without loading megabytes of wasm. Exported on their own as
 * `duel-in-the-dark-circuits/field`, and re-exported from the main entry.
 */

/** BN254 scalar field modulus: every circuit input lives below it. */
export const FIELD_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

/** A uniformly random field element, for salts. */
export function randomField(): bigint {
	// 64 bytes reduced mod p: the bias is below 2^-250, i.e. none.
	const bytes = new Uint8Array(64);
	crypto.getRandomValues(bytes);
	let value = 0n;
	for (const b of bytes) value = (value << 8n) | BigInt(b);
	return value % FIELD_MODULUS;
}
