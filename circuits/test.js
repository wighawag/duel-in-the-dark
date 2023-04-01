const snarkjs = require("snarkjs");
const fs = require("fs");
// import * as snarkjs from "snarkjs";
// import fs from "fs";

async function run() {
  const { proof, publicSignals } = await snarkjs.plonk.fullProve(
    {
      enemy_shot: 1,
      missed: 1,
      previous_commit_hash: 0,

      previous_salt: 0,
      previous_location: 0,
      move: 0,
      new_salt: 0,
      new_location: 2,
    },
    "out/circuit_js/circuit.wasm",
    "out/circuit_final.zkey"
  );

  console.log("Proof: ");
  console.log(JSON.stringify(proof, null, 1));

  const vKey = JSON.parse(fs.readFileSync("out/verification_key.json"));

  const res = await snarkjs.plonk.verify(vKey, publicSignals, proof);

  if (res === true) {
    console.log("Verification OK");
  } else {
    console.log("Invalid proof");
  }
}

run().then(() => {
  process.exit(0);
});
