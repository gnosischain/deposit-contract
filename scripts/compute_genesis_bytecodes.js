const SBCDepositContractProxy = artifacts.require("SBCDepositContractProxy");
const SBCInit = artifacts.require("SBCInit");
const SBCTokenProxy = artifacts.require("SBCTokenProxy");
const SBCWrapperProxy = artifacts.require("SBCWrapperProxy");
const UnsafeTokenProxy = artifacts.require("UnsafeTokenProxy");

// # How to use
//
// Create a keystore and set its public key to env ADMIN. This account you both:
// - Have control of its private key
// - Have some native token funds from genesis allocation. This script adds a pre-mine for admin
//
// ## Connecting to network
//
// To output contracts bytecodes and constructor calls for the specific devnet deployment, run:
// 
// ```
// npx truffle exec scripts/compute_genesis_bytecodes.js --network <name>
// ```
// 
// The network name is the network configuration specified in the networks section of truffle-config.js.
// For instance, devnet3. The secrets or other local settings must be defined in .env file.
// 
// ## Without connecting to network
//
// ```
// ADMIN=0xba61bac431387687512367672613571625671547 npx truffle exec scripts/compute_genesis_bytecodes.js --network xdai_ro
// ```
//
// The resulting JSON must be added to the end of the a chainspec.json genesis file,
// on the 'accounts' field's object.

async function main() {
  const admin = process.env.ADMIN || (await web3.eth.getAccounts())[0];
  const depositAddress = "0xbabe2bed00000000000000000000000000000003";
  const initializerAddress = "0xface2face0000000000000000000000000000000";
  const GNOTokenAddress = "0xbabe2bed00000000000000000000000000000002";
  const mGNOTokenAddress = "0xbabe2bed00000000000000000000000000000001";
  const wrapperAddress = "0xbabe2bed00000000000000000000000000000004";
  const initialGNOStake = 1 * 10_000;

  if (!admin) throw Error("must set ADMIN env");

  // Partial object of an execution layer genesis including only withdrawals contracts.
  // pre-compile contracts should be added latter
  const chainSpecAccounts = {
    // Default pre-mine for admin account
    [admin]: {
      balance: "0xc9f2c9cd04674edea40000000"
    }
  }

  function addBytecode(address, bytecode, params) {
    chainSpecAccounts[address] = {
      balance: "0",
      constructor: bytecode + params.substring(2)
    }
  }

  // Token proxy
  addBytecode(
    mGNOTokenAddress,
    SBCTokenProxy.bytecode,
    web3.eth.abi.encodeParameters(["address", "string", "string"], [initializerAddress, "mGNO devnet", "mGNO"])
  );

  // Stake token proxy
  addBytecode(
    GNOTokenAddress,
    UnsafeTokenProxy.bytecode,
    web3.eth.abi.encodeParameters(["address", "string", "string"], [initializerAddress, "Stake GNO", "GNO"])
  );

  // Deposit proxy
  addBytecode(
    depositAddress,
    SBCDepositContractProxy.bytecode,
    web3.eth.abi.encodeParameters(["address", "address"], [initializerAddress, GNOTokenAddress])
  );

  // Wrapper proxy
  addBytecode(
    wrapperAddress,
    SBCWrapperProxy.bytecode,
    web3.eth.abi.encodeParameters(["address", "address", "address"], [initializerAddress, mGNOTokenAddress, depositAddress])
  );

  // Initializer
  addBytecode(
    initializerAddress,
    SBCInit.bytecode,
    web3.eth.abi.encodeParameters(
      ["address", "uint256", "address", "address", "address", "address"],
      [admin, web3.utils.toWei(initialGNOStake.toString()), mGNOTokenAddress, GNOTokenAddress, depositAddress, wrapperAddress]
    )
  );

  // Done, dump
  console.log(JSON.stringify(chainSpecAccounts, null, 2));
}

module.exports = async function (callback) {
  try {
    await main();
  } catch (e) {
    console.error(e);
  }

  callback();
};

