
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
  const GAS_PRICE = 6.1e9
  const N = 5000

  const depositContract = new web3.eth.Contract(SBCDepositContract.abi, DEPOSIT_CONTRACT_PROXY_ADDRESS)
  const transactionData = depositContract.methods.setSlotGapToZero(N).encodeABI()

  

  // Sent multiple transactions at once
  // const pendingTransactions = 

  let completed = false
  const pendingNonces = new Set()

  async function sendTx() {
    if (completed) return

    try {
      let nonce = await web3.eth.getTransactionCount(admin, 'pending')

      // Find un-used nonce
      while (pendingNonces.has(nonce)) {
        nonce++
      }
      pendingNonces.add(nonce)

      const receipt = await new Promise((resolve, reject) => {
        web3.eth.sendTransaction({
        from: admin,
        to: DEPOSIT_CONTRACT_PROXY_ADDRESS,
        gasLimit: MAX_GAS_PER_TRANSACTION,
        gasPrice: GAS_PRICE,
        data: transactionData,
        nonce
      })
        .on('transactionHash', (hash) => console.log(`tx ${hash} nonce ${nonce} submitted`))
        .on('receipt', (receipt) => resolve(receipt))
        .on('error', e => reject(e))
      })
      console.log(`tx ${receipt.transactionHash} nonce ${nonce} included in block ${receipt.blockNumber}`)
    } catch (e) {
      console.error("tx error", e)
    }
    sendTx()
  }

  for (let i = 0; i < MAX_CONCURRENT_TX; i++) {
    sendTx()
  }

  // Background task to pull nextWithdrawalIndex
  await new Promise((resolve) => {
    setInterval(() => {
      depositContract.methods._deprecated_slot_70_nextWithdrawalIndex().call()
        .then(nextWithdrawalIndex => {
          console.log(Date.now(), nextWithdrawalIndex)
          if (nextWithdrawalIndex == 0) {
            completed = true
            resolve()
          }
        })
        .catch(e => console.error("nextWithdrawalIndex error", e))
    }, 5 * 1000)
  })
  
}

module.exports = async function (callback) {
  try {
    await main();
  } catch (e) {
    console.error(e);
  }

  callback();
};
