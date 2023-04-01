// import * as snarkjs from "snarkjs";
// import fs from "fs";
const { setupCircuit } = require("./simulation/Circuit");

async function run() {
  const circuit = setupCircuit();

  const fullProof = await circuit.generateProof({
    // this is established
    publicState: {
      enemy_shot: 3,
    },
    // this is revealed once the proof is submitted
    revealed: {
      hit: 0,
    },
    // this is kept hidden, except that an hit reveal it
    secretState: {
      previous_location: 1,
      previous_salt: 0,
    },
    // this is a new hiddent action
    secretAction: {
      move: 1,
      new_salt: 0,
      new_location: 2,
    },
  });

  const verified = await circuit.verifyProof(fullProof);
  console.log(verified);
}

run().then(() => {
  process.exit(0);
});
