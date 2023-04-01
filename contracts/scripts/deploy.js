const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const Game = await hre.ethers.getContractFactory("Game");
  const game = await Game.deploy();

  await game.deployed();

  console.log(`Game deployed to ${game.address}`);

  const data = JSON.stringify(
    {
      Game: {
        abi: Game.interface.fragments,
        address: game.address,
      },
    },
    null,
    2
  );
  // console.log(data);
  fs.mkdirSync("../front/src/data", { recursive: true });
  fs.writeFileSync(
    `../front/src/data/contracts.ts`,
    `export default ${data} as const;`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
