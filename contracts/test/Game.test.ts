import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from 'chai';
import { setupCircuit }  from "circuits";
import * as circomlibjs from "circomlibjs";
import * as snarkjs from "snarkjs";
import {ethers} from 'hardhat';
import {Game} from '../typechain-types'

async function solidityProof(fullProof) {
  const calldata = await snarkjs.plonk.exportSolidityCallData(
    fullProof.proof,
    fullProof.publicSignals
  );
  const actualProof = calldata.slice(0, calldata.indexOf(","));
  return actualProof;
}

async function do_move(circuit, contract, values) {
  const { previous_location, move, new_location, hit, enemy_shot, shot } =
    values;

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
  const fronContract = await contract.enemy_shot.staticCall();
  console.log({ fronContract });
  await contract.move(
    await solidityProof(fullProof),
    hit,
    new_commit_hash,
    shot
  );
}

describe("Game", function () {
  async function deployGame() {
    const players = await ethers.getSigners();

    const Game = await ethers.getContractFactory("Game");
    const game: Game = (await Game.deploy()) as unknown as Game;

    const circuit = setupCircuit("../circuits");

    return { games: players.map((v) => game.connect(v)), players, circuit };
  }

  describe("First move", function () {
    it("should fail if wrong data", async function () {
      const { games } = await loadFixture(deployGame);

      const first_hash = "0x00";
      await games[1].start(first_hash);

      await expect(
        games[0].acceptAndMove("0x00", "0x00", true, "0x00", 2)
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
      let new_location = 2;
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
        new_commit_hash,
        2
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
      let new_location = 2;
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
        new_commit_hash,
        2
      );

      await do_move(circuit, games[1], {
        previous_location: first_location,
        move: 3,
        new_location: 2,
        hit: false,
        enemy_shot: 2,
        shot: 2,
      });

      await do_move(circuit, games[0], {
        previous_location: 2,
        move: 2,
        new_location: 4,
        hit: true,
        enemy_shot: 2,
        shot: 3,
      });

      await do_move(circuit, games[1], {
        previous_location: 2,
        move: 3,
        new_location: 1,
        hit: false,
        enemy_shot: 3,
        shot: 4,
      });

      // dead and declared
      await do_move(circuit, games[0], {
        previous_location: 4,
        move: 0,
        new_location: 2,
        hit: true,
        enemy_shot: 4,
        shot: 3,
      });

      await do_move(circuit, games[1], {
        previous_location: 1,
        move: 2,
        new_location: 5,
        hit: false,
        enemy_shot: 3,
        shot: 8,
      });

      // dead cannot make a nove
      await expect(
        do_move(circuit, games[0], {
          previous_location: 2,
          move: 3,
          new_location: 1,
          hit: false,
          enemy_shot: 8,
          shot: 3,
        })
      ).to.be.revertedWith("NO MORE LIFE");
    });
  });
});
