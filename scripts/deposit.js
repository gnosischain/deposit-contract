const Web3 = require('web3')

const { abi } = require('../build/contracts/TestnetDepositContract.json')

const { RPC_URL, GAS_PRICE, STAKING_ACCOUNT_PRIVATE_KEY, BATCH_SIZE, N, OFFSET, DEPOSIT_CONTRACT_ADDRESS } = process.env

const web3 = new Web3(RPC_URL)
const { address } = web3.eth.accounts.wallet.add(STAKING_ACCOUNT_PRIVATE_KEY)

const depositData = require(process.argv[2])

const batchSize = parseInt(BATCH_SIZE, 10)
const offset = parseInt(OFFSET, 10)
const n = parseInt(N, 10)
async function main() {
  const contract = new web3.eth.Contract(abi, DEPOSIT_CONTRACT_ADDRESS)
  const deposits = depositData.slice(offset, offset + n)

  if (!deposits.every(d => d.amount === 32000000000)) {
    console.log('Amount should be exactly 32 tokens for batch deposits')
    return
  }

  console.log(`Sending ${Math.ceil(deposits.length / batchSize)} deposit transactions for ${deposits.length} deposits in batches of ${batchSize} deposits`)
  let balance = await web3.eth.getBalance(address).then(web3.utils.toBN)
  let nonce = await web3.eth.getTransactionCount(address)
  let count = 0
  let arr = [[], [], [], []]

  for (let i = 0; i < deposits.length; i++) {
    const deposit = deposits[i]
    arr[0].push(`0x${deposit.pubkey}`)
    arr[1].push(`0x${deposit.withdrawal_credentials}`)
    arr[2].push(`0x${deposit.signature}`)
    arr[3].push(`0x${deposit.deposit_data_root}`)
    count++

    if (count === batchSize || i === deposits.length - 1) {
      const call = contract.methods.batch_deposit(...arr)
      let gas
      try {
        gas = await call.estimateGas({ from: address })
      } catch (e) {
        console.log('Gas estimation failed:', e.message)
        return
      }
      const gasLimit = Math.ceil(gas * 1.5)
      const feeBN = web3.utils.toBN(GAS_PRICE).muln(gasLimit)
      if (balance.lt(feeBN)) {
        console.log(`Native balance is not enough to cover tx fee, have ${balance.toString()}, required ${feeBN.toString()}`)
        return
      }
      const receipt = await call.send({
        from: address,
        nonce: nonce++,
        gas: gasLimit,
        gasPrice: GAS_PRICE,
      })
      balance = balance.sub(web3.utils.toBN(GAS_PRICE).muln(receipt.gasUsed))
      console.log(`\t${count} next deposits: ${receipt.transactionHash}`)
      arr = [[], [], [], []]
      count = 0
    }
  }
}

main()
