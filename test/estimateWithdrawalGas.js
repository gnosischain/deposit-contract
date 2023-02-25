require('chai').use(require('chai-as-promised')).should()
const {expect} = require("chai")

const SBCDepositContractProxy = artifacts.require('SBCDepositContractProxy.sol')
const SBCDepositContract = artifacts.require('SBCDepositContract.sol')
const SBCWrapperProxy = artifacts.require('SBCWrapperProxy.sol')
const SBCWrapper = artifacts.require('SBCWrapper.sol')
const SBCTokenProxy = artifacts.require('SBCTokenProxy.sol')
const SBCToken = artifacts.require('SBCToken.sol')
const ERC20TestMintable = artifacts.require('ERC20TestMintable.sol')


contract('estimate withdrawal gas', (accounts) => {
  const toMintWei = BigInt(2) ** BigInt(200)
  const admin = accounts[0];
  const withdrawalAmount = '0x0000000773594000' // 32 * 10^9
  const withdrawalCountUpTo = 64; // more than 64 tx reverts

  let tokenProxy
  let token
  let wrapperProxy
  let wrapper
  let contractImplementation
  let contractProxy
  let contract
  let stake
  beforeEach(async () => {
    stake = await ERC20TestMintable.new("test GNO", "tGNO")
    tokenProxy = await SBCTokenProxy.new(admin, 'SBC Token', 'SBCT')
    token = await SBCToken.at(tokenProxy.address)
    contractProxy = await SBCDepositContractProxy.new(admin, token.address, stake.address, stake.address)
    contract = await SBCDepositContract.at(contractProxy.address)
    wrapperProxy = await SBCWrapperProxy.new(admin, token.address, contract.address)
    wrapper = await SBCWrapper.at(wrapperProxy.address)
    await token.setMinter(wrapper.address)

    contractImplementation = await SBCDepositContract.new(token.address, wrapper.address, stake.address)
    await contractProxy.upgradeTo(contractImplementation.address, { from: admin })

    await wrapper.enableToken(stake.address, web3.utils.toWei('32'))
    await stake.mint(admin, toMintWei)
    await stake.approve(wrapper.address, toMintWei)
  })

  it('estimate gas cost of successful withdrawals', async () => {
    console.log(formatGasLogHeader())
    await contract.setOnWithdrawalsUnwrapToGNOByDefault(true)
    await fundDepositContract(BigInt(2) ** BigInt(190), "0x")

    for (let n = 1; n <= withdrawalCountUpTo; n = n * 2) {
      const {amounts, addresses} = populateWithdrawals(n);
      const tx = await contract.executeSystemWithdrawals(0, amounts, addresses)
      expect(getLogEventNames(tx)).deep.equals(fill(n, 'WithdrawalExecuted'))
      console.log(formatGasLog("success withdrawal", n, tx))
    }
  })

  it('estimate gas cost of failed withdrawals', async () => {
    console.log(formatGasLogHeader())
    await contract.setOnWithdrawalsUnwrapToGNOByDefault(true)

    for (let n = 1; n <= withdrawalCountUpTo; n = n * 2) {
      const {amounts, addresses} = populateWithdrawals(n);
      const tx = await contract.executeSystemWithdrawals(0, amounts, addresses)
      // Failed withdrawal emit 1 WithdrawalFailed log per withdrawal
      expect(getLogEventNames(tx)).deep.equals(fill(n, 'WithdrawalFailed'))
      console.log(formatGasLog("failed withdrawal", n, tx))
    }

    for (let n = 1; n <= withdrawalCountUpTo; n = n * 2) {
      const tx = await contract.executeSystemWithdrawals(n, [], [])
      // Failed retries do not emit logs
      expect(getLogEventNames(tx)).deep.equals([])
      console.log(formatGasLog("retry fail withdrawal", n, tx))
    }

    await fundDepositContract(BigInt(2) ** BigInt(190), "0x")

    for (let n = 1; n <= withdrawalCountUpTo; n = n * 2) {
      const {amounts, addresses} = populateWithdrawals(n);
      const tx = await contract.executeSystemWithdrawals(0, amounts, addresses)
      expect(getLogEventNames(tx)).deep.equals(fill(n, 'WithdrawalExecuted'))
      console.log(formatGasLog("retry success withdrawal", n, tx))
    }
  })

  async function fundDepositContract(amount) {
    await wrapper.swap(stake.address, amount, "0x")
    await token.transfer(contract.address, amount)
  }

  function populateWithdrawals(n) {
    const amounts = [] 
    const addresses = []
    for (let i = 0; i < n; i++) {
      amounts.push(withdrawalAmount)
      // Prepending with ff to not transfer to zero address
      addresses.push("0xff" + String(i).padStart(40 - 2, "0"))
    }
    return {amounts, addresses}
  }

  function formatGasLogHeader() {
    return `
| item | count | gasUsed | gas / w |
| ---- | ----- | ------- | ------- |`
  }

  function formatGasLog(msg, n, tx) {
    return `| ${msg} | ${n} | ${tx.receipt.gasUsed} | ${Math.round(tx.receipt.gasUsed / n)} |`
  }
})


function getLogEventNames(tx) {
  return tx.logs.map(log => log.event)
}

function fill(n, value) {
  const arr = []
  for (let i = 0; i < n; i++) {
    arr.push(value)
  }
  return arr
}