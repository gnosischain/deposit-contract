require("dotenv").config();
const HDWalletProvider = require("@truffle/hdwallet-provider");

const privateKey = process.env.DEPLOYMENT_ACCOUNT_PRIVATE_KEY;

module.exports = {
  networks: {
    devnet2: {
      provider: () => new HDWalletProvider(process.env.DEVNET_ACCOUNT_PRIVATE_KEY, process.env.DEVNET2_RPC_URL),
      network_id: "*",
    },
    devnet3: {
      provider: () => new HDWalletProvider(process.env.DEVNET_ACCOUNT_PRIVATE_KEY, process.env.DEVNET3_RPC_URL),
      network_id: "*",
    },
    hardhat: {
      provider: () => new HDWalletProvider(process.env.HARDHAT_ACCOUNT_PRIVATE_KEY, "http://localhost:8545"),
      network_id: "*",
    },
    sokol: {
      provider: () => new HDWalletProvider(privateKey, "https://sokol.poa.network"),
      network_id: 77,
      gasPrice: "1000000000",
      skipDryRun: true,
    },
    xdai: {
      provider: () => new HDWalletProvider(privateKey, "https://rpc.gnosischain.com"),
      network_id: 100,
      gasPrice: "2000000000",
      skipDryRun: true,
    },
    xdai_ro: {
      url: "https://rpc.gnosischain.com",
      network_id: 100,
      gasPrice: "2000000000",
    },
  },
  compilers: {
    solc: {
      version: "0.8.9",
      settings: {
        optimizer: {
          enabled: true,
          runs: 5000000,
        },
        evmVersion: "berlin",
      },
    },
  },
  plugins: ["solidity-coverage"],
};
