const Web3 = require('web3')

const { abi } = require('../build/contracts/IERC677.json')

const { RPC_URL, GAS_PRICE, STAKING_ACCOUNT_PRIVATE_KEY, BATCH_SIZE, N, OFFSET, TOKEN_ADDRESS, DEPOSIT_CONTRACT_ADDRESS } = process.env

const web3 = new Web3(RPC_URL)
const { address } = web3.eth.accounts.wallet.add(STAKING_ACCOUNT_PRIVATE_KEY)

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

  const depositAmountBN =  web3.utils.toBN(32).mul(web3.utils.toBN('1000000000000000000'))
  const tokenBalance = await token.methods.balanceOf(address).call()

  if (web3.utils.toBN(tokenBalance).lt(depositAmountBN)) {
    console.log(`Token balance is not enough to cover all deposits, have ${tokenBalance}, required ${depositAmountBN.toString()}`)
    return
  }

  console.log(`Sending ${Math.ceil(deposits.length / batchSize)} deposit transactions for ${deposits.length} deposits in batches of ${batchSize} deposits`)
  let balance = await web3.eth.getBalance(address).then(web3.utils.toBN)
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
      const amount = depositAmountBN.muln(count)
      const call = token.methods.transferAndCall(DEPOSIT_CONTRACT_ADDRESS, amount, data)
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
      data = '0x' + wc
      count = 0
    }
  }
}

main()
