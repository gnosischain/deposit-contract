
const SBCDepositContract = artifacts.require("SBCDepositContract");

require('dotenv').config()

const GNO_TOKEN_PROXY_ADDRESS = "0x19C653Da7c37c66208fbfbE8908A5051B57b4C70"
const DEPOSIT_CONTRACT_PROXY_ADDRESS = "0xb97036A26259B7147018913bD58a774cf91acf25"

async function main() {
  const admin = (await web3.eth.getAccounts())[0];
  console.log(`connected account ${admin} - must be admin`);

  const MAX_CONCURRENT_TX = 10
  const MAX_GAS_PER_BLOCK = 30e6
  const MAX_GAS_PER_TRANSACTION = MAX_GAS_PER_BLOCK * 0.98
  const APROX_GAS_COST_PER_N = 5_000
  const GAS_PRICE = 7e9
  const N = 5000

  const depositContract = new web3.eth.Contract(SBCDepositContract.abi, DEPOSIT_CONTRACT_PROXY_ADDRESS)

  while (true) {
    const index = await depositContract.methods._deprecated_slot_70_nextWithdrawalIndex().call()
    if (index === 0) {
      return
    }

    const tx = await depositContract.methods.setSlotGapToZero(N).send({
      from: admin,
      gasLimit: MAX_GAS_PER_TRANSACTION,
      gasPrice: GAS_PRICE
    })
    console.log(`tx ${tx.transactionHash} included in block ${tx.blockNumber} index at ${index - N}`)
  }
}


module.exports = async function (callback) {
  await main();
  callback();
};

