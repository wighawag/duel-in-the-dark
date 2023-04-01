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
  const actualProof = calldata.slice(0, calldata.indexOf(","));
  return actualProof;
}

async function do_move(circuit, contract, values) {
  const { previous_location, move, new_location, hit, enemy_shot } = values;

  const poseidon = await circomlibjs.buildPoseidon();
  const new_commit_hash = poseidon.F.toString(poseidon([0, new_location]));

  const fullProof = await circuit.generateProof({
    publicState: {
      enemy_shot: enemy_shot,
    },
    revealed: {
      hit: hit ? 1 : 0,
    },
    secretState: {
      previous_location,
      previous_salt: 0,
    },
    secretAction: {
      move,
      new_salt: 0,
      new_location,
    },
  });
  await contract.move(await solidityProof(fullProof), hit, new_commit_hash);
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
        games[0].acceptAndMove("0x00", "0x00", true, "0x00")
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

      await games[0].acceptAndMove(
        previous_commit_hash,
        await solidityProof(fullProof),
        hit,
        new_commit_hash
      );
    });

    it("full game", async function () {
      const { games, circuit } = await loadFixture(deployGame);

      const first_location = 3;
      const first_poseidon = await circomlibjs.buildPoseidon();
      const first_hash = first_poseidon.F.toString(
        first_poseidon([0, first_location])
      );
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
        publicState: {
          enemy_shot: 0,
        },
        revealed: {
          hit: hit ? 1 : 0,
        },
        secretState: {
          previous_location,
          previous_salt: 0,
          previous_commit_hash,
        },
        secretAction: {
          move,
          new_salt: 0,
          new_location,
          new_commit_hash,
        },
      });

      await games[0].acceptAndMove(
        previous_commit_hash,
        await solidityProof(fullProof),
        hit,
        new_commit_hash
      );

      await do_move(circuit, games[1], {
        previous_location: first_location,
        move: 3,
        new_location: 2,
        hit: false,
        enemy_shot: 0,
      });

      // await do_move(circuit, games[0], {
      //   previous_location: 3,
      //   move: 3,
      //   new_location: 2,
      //   hit: false,
      //   enemy_shot: 0,
      // });
    });
  });
});
