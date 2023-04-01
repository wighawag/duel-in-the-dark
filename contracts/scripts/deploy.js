const hre = require("hardhat");

async function main() {
  const Game = await hre.ethers.getContractFactory("Game");
  const game = await Game.deploy();

  await game.deployed();

  console.log(`Game deployed to ${game.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
