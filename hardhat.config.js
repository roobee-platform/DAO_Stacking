require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require('@openzeppelin/hardhat-upgrades');
require("@nomiclabs/hardhat-web3");

require('dotenv').config();

const INFURA_API_KEY = process.env.INFURA_API_KEY;
const KOVAN_PRIVATE_KEY = process.env.KOVAN_PRIVATE_KEY;
const RINKEBY_PRIVATE_KEY = process.env.RINKEBY_PRIVATE_KEY;
const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const BSC_PRIVATE_KEY = process.env.BSC_PRIVATE_KEY;

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.5.16"
      }, 
      {
        version: "0.7.3"
      }
    ]
  },
  networks: {
    kovan: {
      url: `https://kovan.infura.io/v3/${INFURA_API_KEY}`,
      accounts: KOVAN_PRIVATE_KEY ? [KOVAN_PRIVATE_KEY] : []
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: MAINNET_PRIVATE_KEY ? [MAINNET_PRIVATE_KEY] : []
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_API_KEY}`,
      accounts: RINKEBY_PRIVATE_KEY ? [RINKEBY_PRIVATE_KEY] : []
    },
    BSCTest: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      accounts: KOVAN_PRIVATE_KEY ? [KOVAN_PRIVATE_KEY] : []
    },
    BSC: {
      url: 'https://bsc-dataseed.binance.org/',
      accounts: BSC_PRIVATE_KEY ? [BSC_PRIVATE_KEY] : []
    },
    hardhat: {
      chainId: 1337,
      mining: {
        auto: true,
        interval: 3000
      }
    }
  },
  etherscan: {
    // The url for the Etherscan API you want to use.
    //@ts-ignore
    url: "https://api-rinkeby.etherscan.io/api",
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: ETHERSCAN_API_KEY
  }
};




