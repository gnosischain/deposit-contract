const Web3 = require('web3')

const { abi } = require('../build/contracts/IERC677.json')

const { RPC_URL, DEPLOYMENT_ACCOUNT_PRIVATE_KEY, BATCH_SIZE, N, OFFSET, TOKEN_ADDRESS, DEPOSIT_CONTRACT_ADDRESS } = process.env

const web3 = new Web3(RPC_URL)
const { address } = web3.eth.accounts.wallet.add(DEPLOYMENT_ACCOUNT_PRIVATE_KEY)

const depositData = require(process.argv[2])

const batchSize = parseInt(BATCH_SIZE, 10)
const offset = parseInt(OFFSET, 10)
const n = parseInt(N, 10)
async function main() {
  const token = new web3.eth.Contract(abi, TOKEN_ADDRESS)
  const deposits = depositData.slice(offset, offset + n)

  const wc = deposits[0].withdrawal_credentials
  if (!deposits.every(d => d.withdrawal_credentials === wc)) {
    console.log('Withdrawal credentials do not match')
    return
  }

  if (!deposits.every(d => d.amount === 32000000000)) {
    console.log('Amount should be exactly 32 tokens for batch deposits')
    return
  }

  console.log(`Sending ${Math.ceil(deposits.length / batchSize)} deposit transactions for ${deposits.length} deposits in batches of ${batchSize} events`)
  let nonce = await web3.eth.getTransactionCount(address)
  let count = 0
  let data = '0x' + wc
  for (let i = 0; i < deposits.length; i++) {
    const deposit = deposits[i]
    data += deposit.pubkey
    data += deposit.signature
    data += deposit.deposit_data_root
    count++

    if (count === batchSize || i === deposits.length - 1) {
      const amount = web3.utils.toBN(32 * count).mul(web3.utils.toBN('1000000000000000000'))
      const call = token.methods.transferAndCall(DEPOSIT_CONTRACT_ADDRESS, amount, data)
      const gas = await call.estimateGas({ from: address })
      const receipt = await call.send({
        from: address,
        nonce: nonce++,
        gas: Math.ceil(gas * 1.5),
      })
      console.log(`\t${count} next deposits: ${receipt.transactionHash}`)
      data = '0x' + wc
      count = 0
    }
  }
}

main()
