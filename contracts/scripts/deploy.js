const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const Game = await hre.ethers.getContractFactory("Game");
  const game = await Game.deploy();

  await game.deployed();

  console.log(`Game deployed to ${game.address}`);

  const data = JSON.stringify({
    Game: {
      abi: Game.interface.fragments,
      address: game.address,
    },
  });
  // console.log(data);
  fs.writeFileSync(`../front/src/contracts.json`, data);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
