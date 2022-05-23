require('chai').use(require('chai-as-promised')).should()

const SBCDepositContractProxy = artifacts.require('SBCDepositContractProxy.sol')
const SBCDepositContract = artifacts.require('SBCDepositContract.sol')
const SBCWrapperProxy = artifacts.require('SBCWrapperProxy.sol')
const SBCWrapper = artifacts.require('SBCWrapper.sol')
const SBCTokenProxy = artifacts.require('SBCTokenProxy.sol')
const SBCToken = artifacts.require('SBCToken.sol')
const PermittableToken = artifacts.require('PermittableToken.sol')
const BlockReward = artifacts.require('BlockReward.sol')
const Lens = artifacts.require('Lens.sol')

const deposit = {
  pubkey: '0x85e52247873439b180471ceb94ef9966c2cef1c194cc926e7d6494fecccbcdc076bcd751309f174dd8b7e21402c85ac0',
  withdrawal_credentials: '0x0100000000000000000000000ae055097c6d159879521c384f1d2123d1f195e6',
  signature: '0x869a92ea96afe7a08e19c0b89259c52d156f83b9af83d6e411f5f39ad857a06a3b9885d5f8d7ddb9371256fe181df4e011463e93b23af2653b501b9ebcfc32131ae7b8a1c815c6d8b2e7accb890f06f0a0bc4604050d658241ffb78220a2db58',
  deposit_data_root: '0xdcc623abcf86090d33c63845a83b13064e558ea9aa38d5db07d2dd412bebc9f0',
  value: '32000000000000000000'
}
const systemAddress = '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE'

function joinHex(args) {
  return '0x' + args.map(web3.utils.stripHexPrefix).join('')
}

contract('BlockReward', (accounts) => {
  let tokenProxy
  let token
  let wrapperProxy
  let wrapper
  let contractProxy
  let contract
  let stake
  let blockReward
  let lens
  before(async () => {
    web3.extend({
      property: 'evm',
      methods: [{
        name: 'addAccount',
        call: 'evm_addAccount',
        params: 2,
        inputFormatter: [web3.extend.formatters.inputAddressFormatter, null],
        outputFormatter: null
      }]
    })
    await web3.evm.addAccount(systemAddress, '')
    await web3.eth.personal.unlockAccount(systemAddress, '', 10000)
    await web3.eth.sendTransaction({from: accounts[0], to: systemAddress, value: web3.utils.toWei('10')})
  })

  beforeEach(async () => {
    stake = await PermittableToken.new('Test token', 'TEST', 18, 1337)
    await stake.mint(accounts[0], web3.utils.toWei('1000'))
    tokenProxy = await SBCTokenProxy.new(accounts[0], 'SBC Token', 'SBCT')
    token = await SBCToken.at(tokenProxy.address)
    contractProxy = await SBCDepositContractProxy.new(accounts[0], token.address)
    contract = await SBCDepositContract.at(contractProxy.address)
    wrapperProxy = await SBCWrapperProxy.new(accounts[0], token.address, contract.address)
    wrapper = await SBCWrapper.at(wrapperProxy.address)
    await token.setMinter(wrapper.address)

    await wrapper.enableToken(stake.address, web3.utils.toWei('32'))

    blockReward = await BlockReward.new()

    await contract.initializeWithdrawals(wrapper.address, blockReward.address)

    lens = await Lens.new(stake.address, token.address, wrapper.address, contract.address, blockReward.address)
  })

  it('single withdrawal to underlying token', async () => {
    const data = joinHex([deposit.withdrawal_credentials, deposit.pubkey, deposit.signature, deposit.deposit_data_root])

    // deposit 1 token == 32 meta tokens
    await stake.transferAndCall(wrapper.address, web3.utils.toWei('1'), data)

    // fill accrued rewards
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('32'))
    await stake.transfer(wrapper.address, web3.utils.toWei('0.1'))
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('35.2'))

    // system call to block reward contract, withdrawal of 35.2 meta tokens
    await blockReward.addBeaconWithdrawals([0], [accounts[0]], [web3.utils.toWei('35.2', 'gwei')], { from: systemAddress })
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('0'))

    // user calls deposit contract to withdraw 35.2 meta tokens and automatically swap them to 1.1 regular tokens
    await contract.withdraw([0], wrapper.address, web3.eth.abi.encodeParameters(['address', 'address'], [stake.address, accounts[1]]))

    // user receives 1.1 tokens on the withdrawal address
    expect((await stake.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('1.1'))
    expect((await token.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('0'))
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('0'))
  })

  it('single withdrawal to meta token', async () => {
    const data = joinHex([deposit.withdrawal_credentials, deposit.pubkey, deposit.signature, deposit.deposit_data_root])

    // deposit 1 token == 32 meta tokens
    await stake.transferAndCall(wrapper.address, web3.utils.toWei('1'), data)
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('32'))

    // system call to block reward contract, withdrawal of 35.2 meta tokens
    await blockReward.addBeaconWithdrawals([0], [accounts[0]], [web3.utils.toWei('35.2', 'gwei')], { from: systemAddress })
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('-3.2'))

    // user calls deposit contract to withdraw 35.2 meta tokens
    await contract.withdraw([0], accounts[1], '0x')

    // user receives 1.1 tokens on the withdrawal address
    expect((await stake.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('0'))
    expect((await token.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('35.2'))
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('-3.2'))

    await token.approve(wrapper.address, web3.utils.toWei('1000'), { from: accounts[1] })
    await wrapper.unwrapTokens(stake.address, accounts[1], web3.utils.toWei('35.2'), { from: accounts[1] }).should.be.rejected
    await wrapper.unwrapTokens(stake.address, accounts[1], web3.utils.toWei('30'), { from: accounts[1] })
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('-3.2'))
    await wrapper.unwrapTokens(stake.address, accounts[1], web3.utils.toWei('5.2'), { from: accounts[1] }).should.be.rejected
    await stake.transfer(wrapper.address, web3.utils.toWei('0.1'))
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('0'))
    await wrapper.unwrapTokens(stake.address, accounts[1], web3.utils.toWei('5.2'), { from: accounts[1] })

    expect((await stake.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('1.1'))
    expect((await token.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('0'))
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('0'))
  })

  it('should make batch withdrawal', async () => {
    const data = joinHex([deposit.withdrawal_credentials, deposit.pubkey, deposit.signature, deposit.deposit_data_root])

    // deposit 1 token == 32 meta tokens
    await stake.transferAndCall(wrapper.address, web3.utils.toWei('1'), data)
    await stake.transferAndCall(wrapper.address, web3.utils.toWei('1'), data)
    await stake.transferAndCall(wrapper.address, web3.utils.toWei('1'), data)

    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('96'))

    // system call to block reward contract, withdrawal of 2 * 35.2 meta tokens
    await blockReward.addBeaconWithdrawals([0, 1], [accounts[0], accounts[0]], [web3.utils.toWei('35.2', 'gwei'), web3.utils.toWei('35.2', 'gwei')], { from: systemAddress })
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('25.6'))

    // user calls deposit contract to withdraw 2 * 35.2 meta tokens and automatically swap them to 2.2 regular tokens
    await contract.withdraw([0, 1], wrapper.address, web3.eth.abi.encodeParameters(['address', 'address'], [stake.address, accounts[1]]))

    // user receives 1.1 tokens on the withdrawal address
    expect((await stake.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('2.2'))
    expect((await token.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('0'))
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('25.6'))
  })

  it('should allow to withdraw for a different address', async () => {
    const data = joinHex([deposit.withdrawal_credentials, deposit.pubkey, deposit.signature, deposit.deposit_data_root])

    // deposit 1 token == 32 meta tokens
    await stake.transferAndCall(wrapper.address, web3.utils.toWei('1'), data)

    // system call to block reward contract, withdrawal of 32 meta tokens
    await blockReward.addBeaconWithdrawals([0], [accounts[0]], [web3.utils.toWei('32', 'gwei')], { from: systemAddress })

    // user calls deposit contract to withdraw 32 meta tokens on behalf of a different user
    await contract.withdraw([0], accounts[1], '0x', { from: accounts[1] }).should.be.rejected
    await contract.approveOperator(accounts[0], accounts[1], true, { from: accounts[1] }).should.be.rejected
    await contract.approveOperator(accounts[0], accounts[1], true)
    await contract.withdraw([0], accounts[1], '0x', { from: accounts[1] })

    // user receives 1.1 tokens on the withdrawal address
    expect((await stake.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('0'))
    expect((await token.balanceOf(accounts[0])).toString()).to.be.equal(web3.utils.toWei('0'))
    expect((await token.balanceOf(accounts[1])).toString()).to.be.equal(web3.utils.toWei('32'))
    expect((await lens.surplus()).toString()).to.be.equal(web3.utils.toWei('0'))
  })
})
