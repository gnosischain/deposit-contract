require('dotenv').config()
const HDWalletProvider = require("@truffle/hdwallet-provider")
const Ganache = require('ganache')

const privateKey = process.env.DEPLOYMENT_ACCOUNT_PRIVATE_KEY

module.exports = {
  networks: {
    development: {
      provider: Ganache.provider({
        miner: {
          instamine: 'strict'
        },
        gasLimit: 100000000,
        logger: { log: () => {} },
      }),
      network_id: '*',
    },
    sokol: {
      provider: () => new HDWalletProvider(privateKey, 'https://sokol.poa.network'),
      network_id: 77,
      gasPrice: '1000000000',
      skipDryRun: true,
    },
    xdai: {
      provider: () => new HDWalletProvider(privateKey, 'https://dai.poa.network'),
      network_id: 100,
      gasPrice: '1000000000',
      skipDryRun: true,
    }
  },
  compilers: {
    solc: {
      version: "pragma",
      settings: {
        optimizer: {
          enabled: true,
          runs: 5000000,
        },
      },
    },
  },
  plugins: ['solidity-coverage'],
};
