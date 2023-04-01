const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("Game", function () {
  async function deployGame() {
    const players = await ethers.getSigners();

    const Game = await ethers.getContractFactory("Game");
    const game = await Game.deploy();

    return { games: players.map((v) => game.connect(v)), players };
  }

  describe("First move", function () {
    it("should fail if wrong data", async function () {
      const { games } = await loadFixture(deployGame);

      await expect(games[0].move("0x00", true, "0x00")).to.be.revertedWith(
        "INVALID_PROOF"
      );
    });
  });
});
