const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { setupCircuit } = require("circuits");
const circomlibjs = require("circomlibjs");
const snarkjs = require("snarkjs");

async function solidityProof(fullProof) {
  const calldata = await snarkjs.plonk.exportSolidityCallData(
    fullProof.proof,
    fullProof.publicSignals
  );
  console.log(calldata);
  const actualProof = calldata.slice(0, calldata.indexOf(","));
  console.log({ actualProof });
  return actualProof;
}

describe("Game", function () {
  async function deployGame() {
    const players = await ethers.getSigners();

    const Game = await ethers.getContractFactory("Game");
    const game = await Game.deploy();

    const circuit = setupCircuit("../circuits");

    return { games: players.map((v) => game.connect(v)), players, circuit };
  }

  describe("First move", function () {
    it("should fail if wrong data", async function () {
      const { games } = await loadFixture(deployGame);

      const first_hash = "0x00";
      await games[1].start(first_hash);

      await expect(
        games[0].acceptAndMove("0x00", true, "0x00")
      ).to.be.revertedWith("INVALID_PROOF");
    });

    it("should succeed with right data", async function () {
      const { games, circuit } = await loadFixture(deployGame);

      const first_hash = "0x00";
      await games[1].start(first_hash);

      let poseidon;
      let new_commit_hash;
      let fullProof;
      let hit;
      let move;
      let previous_commit_hash;
      let previous_location;

      previous_location = 1;
      poseidon = await circomlibjs.buildPoseidon();
      previous_commit_hash = poseidon.F.toString(
        poseidon([0, previous_location])
      );
      move = 1;
      new_location = 2;
      poseidon = await circomlibjs.buildPoseidon();
      new_commit_hash = poseidon.F.toString(poseidon([0, new_location]));
      hit = false;
      fullProof = await circuit.generateProof({
        // this is established
        publicState: {
          enemy_shot: 0,
        },
        // this is revealed once the proof is submitted
        revealed: {
          hit: hit ? 1 : 0,
        },
        // this is kept hidden, except that an hit reveal it
        secretState: {
          previous_location,
          previous_salt: 0,
          previous_commit_hash,
        },
        // this is a new hiddent action
        secretAction: {
          move,
          new_salt: 0,
          new_location,
          new_commit_hash,
        },
      });

      console.log(JSON.stringify(fullProof, null, 2));
      console.log(
        JSON.stringify(
          fullProof.publicSignals.map((v) => BigInt(v).toString(16)),
          null,
          2
        )
      );

      const solProof = await solidityProof(fullProof);
      console.log(
        JSON.stringify(
          {
            previous_commit_hash: BigInt(previous_commit_hash).toString(16),
            solProof,
            hit,
            new_commit_hash: BigInt(new_commit_hash).toString(16),
          },
          null,
          2
        )
      );

      await games[0].acceptAndMove(
        previous_commit_hash,
        solProof,
        hit,
        new_commit_hash
      );
    });

    it("full game", async function () {
      const { games, circuit } = await loadFixture(deployGame);

      const first_hash = "0x00";
      await games[1].start(first_hash);

      let fullProof;
      let hit;
      let newHash = 0; // TODO

      fullProof = await circuit.generateProof({
        publicState: {
          enemy_shot: 3,
        },
        revealed: {
          hit: hit ? 1 : 0,
        },
        secretState: {
          previous_location: 1,
          previous_salt: 0,
        },
        secretAction: {
          move: 1,
          new_salt: 0,
          new_location: 2,
        },
      });
      await games[0].move(proofToSolidityInput(fullProof.proof), hit, newHash);

      fullProof = await circuit.generateProof({
        publicState: {
          enemy_shot: 3,
        },
        revealed: {
          hit: hit ? 1 : 0,
        },
        secretState: {
          previous_location: 1,
          previous_salt: 0,
        },
        secretAction: {
          move: 1,
          new_salt: 0,
          new_location: 2,
        },
      });
      await games[1].move(proofToSolidityInput(fullProof.proof), hit, newHash);
    });
  });
});
