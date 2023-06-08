require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.18",
  paths: {
    sources: "src",
  },
  networks: {
    localhost: {
      url: "http://localhost:8545",
    },
  },
};
