const snarkjs = require("snarkjs");
const fs = require("fs");
const circomlibjs = require("circomlibjs");

module.exports = {
  setupCircuit(p) {
    const pathToWasm = (p ? p + "/" : "") + "out/circuit_js/circuit.wasm";
    const pathToZkey = (p ? p + "/" : "") + "out/circuit_final.zkey";
    const pathToVerificationKey =
      (p ? p + "/" : "") + "out/verification_key.json";

    async function generateProof(situation) {
      const { publicState, revealed, secretState, secretAction, publicAction } =
        situation;

      const poseidon = await circomlibjs.buildPoseidon();
      const previous_commit_hash =
        secretState.previous_commit_hash ||
        poseidon.F.toString(poseidon([0, secretState.previous_location]));

      const fullProof = await snarkjs.plonk.fullProve(
        {
          enemy_shot: publicState.enemy_shot,
          hit: revealed.hit,
          previous_commit_hash,

          previous_salt: secretState.previous_salt,
          previous_location: secretState.previous_location,
          move: secretAction.move,
          new_salt: secretAction.new_salt,
          new_location: secretAction.new_location,
        },
        pathToWasm,
        pathToZkey
      );

      // console.log(JSON.stringify(fullProof, null, 2));

      return fullProof;
    }
    async function verifyProof(fullProof) {
      const { proof, publicSignals } = fullProof;

      const vKey = JSON.parse(fs.readFileSync(pathToVerificationKey));
      const res = await snarkjs.plonk.verify(vKey, publicSignals, proof);

      return res;
    }
    return {
      generateProof,
      verifyProof,
    };
  },
};
