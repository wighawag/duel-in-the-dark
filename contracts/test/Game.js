const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { setupCircuit } = require("circuits");

// ------------------------------------------------------------------------------------------------
// from https://github.com/kunalmodi/battlesnark
// ------------------------------------------------------------------------------------------------
const toHex32 = (num) => {
  let str = num.toString(16);
  while (str.length < 64) str = "0" + str;
  return str;
};
// Instead of passing in a large array of numbers (annoying), we
// just make proof a single string (which will be decompiled as a uint32
// in the contract)
// Copied from Tornado's websnark fork:
// https://github.com/tornadocash/websnark/blob/master/src/utils.js
const proofToSolidityInput = (proof) => {
  const proofs = [
    proof.A[0],
    proof.A[1],
    proof.B[0][1],
    proof.B[0][0],
    proof.B[1][1],
    proof.B[1][0],
    proof.C[0],
    proof.C[1],
  ];
  const flatProofs = proofs.map((p) => BigInt(p));
  return "0x" + flatProofs.map((x) => toHex32(x)).join("");
};
// ------------------------------------------------------------------------------------------------

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

      await expect(games[0].move("0x00", true, "0x00")).to.be.revertedWith(
        "INVALID_PROOF"
      );
    });

    it("should succeed with right data", async function () {
      const { games, circuit } = await loadFixture(deployGame);

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
      await expect(
        games[0].move(proofToSolidityInput(fullProof.proof), false, 0)
      ).to.be.revertedWith("INVALID_PROOF");
    });
  });
});
