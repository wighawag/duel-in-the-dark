const snarkjs = require("snarkjs");
const fs = require("fs");
// import * as snarkjs from "snarkjs";
// import fs from "fs";

async function run() {
  const { proof, publicSignals } = await snarkjs.plonk.fullProve(
    { a: 10, b: 21 },
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
