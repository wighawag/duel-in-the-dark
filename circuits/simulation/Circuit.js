const snarkjs = require("snarkjs");
const fs = require("fs");
const circomlibjs = require("circomlibjs");

module.exports = {
  setupCircuit() {
    async function generateProof(situation) {
      const { publicState, revealed, secretState, secretAction, publicAction } =
        situation;

      const poseidon = await circomlibjs.buildPoseidon();
      const previous_commit_hash = poseidon.F.toString(
        poseidon([0, secretState.previous_location])
      );

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
        "out/circuit_js/circuit.wasm",
        "out/circuit_final.zkey"
      );

      return fullProof;

      // console.log("Proof: ");
      // console.log(JSON.stringify(proof, null, 1));
    }
    async function verifyProof(fullProof) {
      const { proof, publicSignals } = fullProof;

      const vKey = JSON.parse(fs.readFileSync("out/verification_key.json"));
      const res = await snarkjs.plonk.verify(vKey, publicSignals, proof);

      return res;
    }
    return {
      generateProof,
      verifyProof,
    };
  },
};
