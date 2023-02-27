require('chai').use(require('chai-as-promised')).should()

const { stakeBytecode } = require('./utils')

const SBCDepositContractProxy = artifacts.require('SBCDepositContractProxy.sol')
const SBCDepositContract = artifacts.require('SBCDepositContract.sol')
const SBCWrapperProxy = artifacts.require('SBCWrapperProxy.sol')
const SBCWrapper = artifacts.require('SBCWrapper.sol')
const SBCTokenProxy = artifacts.require('SBCTokenProxy.sol')
const SBCToken = artifacts.require('SBCToken.sol')
const IERC677 = artifacts.require('IERC677.sol')

const deposit = {
  pubkey: '0x85e52247873439b180471ceb94ef9966c2cef1c194cc926e7d6494fecccbcdc076bcd751309f174dd8b7e21402c85ac0',
  withdrawal_credentials: '0x0100000000000000000000000ae055097c6d159879521c384f1d2123d1f195e6',
  signature: '0x869a92ea96afe7a08e19c0b89259c52d156f83b9af83d6e411f5f39ad857a06a3b9885d5f8d7ddb9371256fe181df4e011463e93b23af2653b501b9ebcfc32131ae7b8a1c815c6d8b2e7accb890f06f0a0bc4604050d658241ffb78220a2db58',
  deposit_data_root: '0xdcc623abcf86090d33c63845a83b13064e558ea9aa38d5db07d2dd412bebc9f0',
  value: '1000000000000000000'
}
const otherDeposit = {
  pubkey: '0xa9529f1f7ac7e6607ac605e2152053e3d3a8ce7c48308654d452f5cb8a1eb5e238c4b9e992caf8ec6923994b07e4d236',
  withdrawal_credentials: '0x0100000000000000000000000ae055097c6d159879521c384f1d2123d1f195e6',
  signature: '0xb4c4fa967494ad174355ea8da67ddd73e49f0936ffbf95f4096031cd00a44a45a89d12f17c58b80de6db465581635c5412876fb12ed882eaa1f744cf5c71f493d8a2c5eee30d7181f8e70a5ebd9b43d2015e1dfbc1b466e307faf850601930f1',
  deposit_data_root: '0xef472710da79583c8f513e816e178a746afe060a2ed5b0032696d898909d1d83',
  value: '1000000000000000000'
}
const depositWC1 = {
  pubkey: '0x95214485553be079e2723c04f8d18c110adaeb56c5e64b97f5df59862a0188c301686cdd55e31aa733a0988e9cfe4de4',
  withdrawal_credentials: '0x0100000000000000000000000ae055097c6d159879521c384f1d2123d1f195e6',
  signature: '0xaf388083b3377002f9bda48fb435a6d2bb9e06717494ed3e5e7d00711fbb0028d460e9aa3321a90c5705d7a9ccb5375b125d0394858650fc29c03880654f4c592301d7dbf0db6db2369c623e8734e291d0b0a81030c7c9a6df99b08d2172190f',
  deposit_data_root: '0xcfe78c9aff7cbb24c317b05b8c6e29b93003f8271944c37c7d17e5490ee5d494',
  value: '1000000000000000000'
}
const depositWC2 = {
  pubkey: '0x95214485553be079e2723c04f8d18c110adaeb56c5e64b97f5df59862a0188c301686cdd55e31aa733a0988e9cfe4de4',
  withdrawal_credentials: '0x010000000000000000000000c00e94cb662c3520282e6f5717214004a7f26888',
  signature: '0xa0b87d3b9a1373d8097405bfb6f6ee4a237dfcdff6cf8be37932237504c80949409f22666900b3d5518b5f3a42d790960bbabec0221a73857d928a45c2f9913e6dc1f6b6b72a90dd4c8c7320913bedde1b9b6e33b20cd7fa18f5664faf162be4',
  deposit_data_root: '0x6f776e2ebf8eed5b75896b63ecec56cc31e3ab637530a9c4d041d82a0cf46a7f',
  value: '1000000000000000000'
}
const invalidDataRoot = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

function joinHex(args) {
  return '0x' + args.map(web3.utils.stripHexPrefix).join('')
}

const halfDepositAmount = web3.utils.toWei('0.5')
const depositAmount = web3.utils.toWei('1')

contract('SBCDepositContractProxy', (accounts) => {
  let tokenProxy
  let token
  let wrapperProxy
  let wrapper
  let contractImplementation
  let contractProxy
  let contract
  let stake
  beforeEach(async () => {
    IERC677.bytecode = stakeBytecode
    stake = await IERC677.new()
    tokenProxy = await SBCTokenProxy.new(accounts[0], 'SBC Token', 'SBCT')
    token = await SBCToken.at(tokenProxy.address)
    contractProxy = await SBCDepositContractProxy.new(accounts[0], stake.address)
    contract = await SBCDepositContract.at(contractProxy.address)
    wrapperProxy = await SBCWrapperProxy.new(accounts[0], token.address, contract.address)
    wrapper = await SBCWrapper.at(wrapperProxy.address)
    await token.setMinter(wrapper.address)

    contractImplementation = await SBCDepositContract.new(stake.address)
    await contractProxy.upgradeTo(contractImplementation.address, { from: accounts[0] })

    await wrapper.enableToken(stake.address, web3.utils.toWei('32'))
    await stake.transfer(wrapper.address, web3.utils.toWei('100'))
  })

  it('should deposit', async () => {
    expect(await contract.get_deposit_count()).to.be.equal('0x0000000000000000')
    expect(await contract.get_deposit_root()).to.be.equal('0xd70a234731285c6804c2a4f56711ddb8c82c99740f207854891028af34e27e5e')
    await contract.deposit(
      deposit.pubkey,
      deposit.withdrawal_credentials,
      deposit.signature,
      deposit.deposit_data_root,
      deposit.value
    ).should.be.rejected
    await stake.approve(contract.address, deposit.value)
    await contract.deposit(
      deposit.pubkey,
      deposit.withdrawal_credentials,
      deposit.signature,
      invalidDataRoot,
      deposit.value
    ).should.be.rejected
    await contract.deposit(
      deposit.pubkey,
      deposit.withdrawal_credentials,
      deposit.signature,
      deposit.deposit_data_root,
      deposit.value
    )
    expect(await contract.get_deposit_count()).to.be.equal('0x0100000000000000')
    expect(await contract.get_deposit_root()).to.be.equal('0x4e84f51e6b1cf47fd51d021635d791b9c99fe915990061a5a10390b9140e3592')
    expect((await stake.balanceOf(contract.address)).toString()).to.be.equal('1000000000000000000')
  })

  it('should batch deposit', async () => {
    await contract.batchDeposit(
      joinHex([deposit.pubkey, otherDeposit.pubkey]),
      deposit.withdrawal_credentials,
      joinHex([deposit.signature, otherDeposit.signature]),
      [deposit.deposit_data_root, otherDeposit.deposit_data_root]
    ).should.be.rejected
    await stake.approve(contract.address, '1000000000000000000')
    await contract.batchDeposit(
      joinHex([deposit.pubkey, otherDeposit.pubkey]),
      deposit.withdrawal_credentials,
      joinHex([deposit.signature, otherDeposit.signature]),
      [deposit.deposit_data_root, otherDeposit.deposit_data_root]
    ).should.be.rejected
    await stake.approve(contract.address, '2000000000000000000')
    await contract.batchDeposit(
      joinHex([deposit.pubkey, otherDeposit.pubkey]),
      deposit.withdrawal_credentials,
      joinHex([deposit.signature, otherDeposit.signature]),
      [deposit.deposit_data_root, otherDeposit.deposit_data_root]
    )
    expect(await contract.get_deposit_count()).to.be.equal('0x0200000000000000')
    expect(await contract.get_deposit_root()).to.be.equal('0x332ba4af23d9afe9a5ac1c80604c72a995686b8decfdae91f69798bc93813257')
    expect((await stake.balanceOf(contract.address)).toString()).to.be.equal('2000000000000000000')
  })

  it('should deposit via transferAndCall', async () => {
    const invalidData = joinHex([deposit.withdrawal_credentials, deposit.pubkey, deposit.signature, invalidDataRoot])
    const data = joinHex([deposit.withdrawal_credentials, deposit.pubkey, deposit.signature, deposit.deposit_data_root])
    await stake.transferAndCall(contract.address, deposit.value, invalidData).should.be.rejected
    await stake.transferAndCall(contract.address, deposit.value, data)
    expect(await contract.get_deposit_count()).to.be.equal('0x0100000000000000')
    expect(await contract.get_deposit_root()).to.be.equal('0x4e84f51e6b1cf47fd51d021635d791b9c99fe915990061a5a10390b9140e3592')
    expect((await stake.balanceOf(contract.address)).toString()).to.be.equal('1000000000000000000')
  })

  it('should batch deposit via transferAndCall', async () => {
    const invalidData = joinHex([deposit.pubkey, deposit.signature, invalidDataRoot])
    const data1 = joinHex([deposit.pubkey, deposit.signature, deposit.deposit_data_root])
    const data2 = joinHex([otherDeposit.pubkey, otherDeposit.signature, otherDeposit.deposit_data_root])
    await stake.transferAndCall(contract.address, '3000000000000000000', joinHex([deposit.withdrawal_credentials, invalidData, data1])).should.be.rejected
    await stake.transferAndCall(contract.address, '2000000000000000000', joinHex([deposit.withdrawal_credentials, data1, invalidData])).should.be.rejected
    await stake.transferAndCall(contract.address, '3000000000000000000', joinHex([deposit.withdrawal_credentials, data1, data2])).should.be.rejected
    await stake.transferAndCall(contract.address, '2000000000000000000', joinHex([deposit.withdrawal_credentials, data1, data2]))
    expect(await contract.get_deposit_count()).to.be.equal('0x0200000000000000')
    expect(await contract.get_deposit_root()).to.be.equal('0x332ba4af23d9afe9a5ac1c80604c72a995686b8decfdae91f69798bc93813257')
    expect((await stake.balanceOf(contract.address)).toString()).to.be.equal('2000000000000000000')
  })

  it('should pause', async () => {
    expect(await contract.paused()).to.be.equal(false)
    await contract.unpause({ from: accounts[1] }).should.be.rejected
    await contract.unpause({ from: accounts[0] }).should.be.rejected
    await contract.pause({ from: accounts[1] }).should.be.rejected
    await contract.pause({ from: accounts[0] })
    expect(await contract.paused()).to.be.equal(true)

    const data = joinHex([deposit.withdrawal_credentials, deposit.pubkey, deposit.signature, deposit.deposit_data_root])
    await stake.transferAndCall(contract.address, deposit.value, data).should.be.rejected

    await contract.pause({ from: accounts[1] }).should.be.rejected
    await contract.pause({ from: accounts[0] }).should.be.rejected
    await contract.unpause({ from: accounts[1] }).should.be.rejected
    await contract.unpause({ from: accounts[0] })
    expect(await contract.paused()).to.be.equal(false)

    await stake.transferAndCall(contract.address, deposit.value, data)

    expect(await contract.get_deposit_count()).to.be.equal('0x0100000000000000')
    expect(await contract.get_deposit_root()).to.be.equal('0x4e84f51e6b1cf47fd51d021635d791b9c99fe915990061a5a10390b9140e3592')
    expect((await stake.balanceOf(contract.address)).toString()).to.be.equal('1000000000000000000')
  })

  it('should not accept other withdrawal credentials', async () => {
    await stake.approve(contract.address, '3000000000000000000')
    for (let i = 0; i < 2; i++) {
      await contract.deposit(
        depositWC1.pubkey,
        depositWC1.withdrawal_credentials,
        depositWC1.signature,
        depositWC1.deposit_data_root,
        depositWC1.value
      )
      await contract.deposit(
        depositWC2.pubkey,
        depositWC2.withdrawal_credentials,
        depositWC2.signature,
        depositWC2.deposit_data_root,
        depositWC2.value
      ).should.be.rejected
    }
  })

  it('should withdraw zero only with permission', async () => {
    const amounts = ['0x0000000000000000', '0x0000000000000000']
    const elongatedAmounts = ['0x0000000000000000', '0x0000000000000000', '0x0000000000000000']
    const addresses = [accounts[0], accounts[0]]
    await contract.executeSystemWithdrawals(10, amounts, addresses, { from: accounts[1] }).should.be.rejected
    await contract.executeSystemWithdrawals(10, elongatedAmounts, addresses, { from: accounts[0] }).should.be.rejected
    await contract.executeSystemWithdrawals(10, amounts, addresses, { from: accounts[0] })
  })

  it('should correctly withdraw GNO, even with failed withdrawal', async () => {
    const amounts = ['0x000000003B9ACA00'] // 10^9
    const addresses = [accounts[1]]

    // simple withdrawal
    await stake.transfer(contract.address, depositAmount)

    await contract.executeSystemWithdrawals(0, amounts, addresses)
    const mGNOBalanceAfterFirstWithdrawal = (await stake.balanceOf(accounts[1])).toString()
    expect(mGNOBalanceAfterFirstWithdrawal).to.be.equal(depositAmount)


    // failed and processed by queue
    await contract.executeSystemWithdrawals(0, amounts, addresses)
    let numberOfFailedWithdrawals = (await contract.numberOfFailedWithdrawals()).toString()
    expect(numberOfFailedWithdrawals).to.be.equal('1')

    await stake.transfer(contract.address, depositAmount)

    await contract.processFailedWithdrawalsFromPointer(5)
    const mGNOBalanceAfterSecondWithdrawal = (await stake.balanceOf(accounts[1])).toString()
    expect(mGNOBalanceAfterSecondWithdrawal).to.be.equal(web3.utils.toWei('2'))
    let failedWithdrawalsPointer = (await contract.failedWithdrawalsPointer()).toString()
    expect(failedWithdrawalsPointer).to.be.equal('1')
    await contract.processFailedWithdrawal(0, 0).should.be.rejected


    // failed and processed by queue in executeSystemWithdrawals
    await contract.executeSystemWithdrawals(0, amounts, addresses)
    numberOfFailedWithdrawals = (await contract.numberOfFailedWithdrawals()).toString()
    expect(numberOfFailedWithdrawals).to.be.equal('2')

    await stake.transfer(contract.address, depositAmount)

    await contract.executeSystemWithdrawals(2, [], [])
    const mGNOBalanceAfterThirdWithdrawal = (await stake.balanceOf(accounts[1])).toString()
    expect(mGNOBalanceAfterThirdWithdrawal).to.be.equal(web3.utils.toWei('3'))
    failedWithdrawalsPointer = (await contract.failedWithdrawalsPointer()).toString()
    expect(failedWithdrawalsPointer).to.be.equal('2')
    await contract.processFailedWithdrawal(1, 0).should.be.rejected


    // failed and processed manually
    await contract.executeSystemWithdrawals(0, amounts, addresses)
    numberOfFailedWithdrawals = (await contract.numberOfFailedWithdrawals()).toString()
    expect(numberOfFailedWithdrawals).to.be.equal('3')

    await stake.transfer(contract.address, depositAmount)

    await contract.processFailedWithdrawal(2, 0)
    await contract.processFailedWithdrawal(2, 0).should.be.rejected

    let mGNOBalanceAfterFourthWithdrawal = (await stake.balanceOf(accounts[1])).toString()
    expect(mGNOBalanceAfterFourthWithdrawal).to.be.equal(web3.utils.toWei('4'))
    failedWithdrawalsPointer = (await contract.failedWithdrawalsPointer()).toString()
    expect(failedWithdrawalsPointer).to.be.equal('2')
    await contract.processFailedWithdrawalsFromPointer(5)
    mGNOBalanceAfterFourthWithdrawal = (await stake.balanceOf(accounts[1])).toString()
    expect(mGNOBalanceAfterFourthWithdrawal).to.be.equal(web3.utils.toWei('4'))
    failedWithdrawalsPointer = (await contract.failedWithdrawalsPointer()).toString()
    expect(failedWithdrawalsPointer).to.be.equal('3')


    // failed and processed partially manually
    await contract.executeSystemWithdrawals(0, amounts, addresses)
    numberOfFailedWithdrawals = (await contract.numberOfFailedWithdrawals()).toString()
    expect(numberOfFailedWithdrawals).to.be.equal('4')

    await stake.transfer(contract.address, depositAmount)

    await contract.processFailedWithdrawal(3, halfDepositAmount,  { from : addresses[0] })

    let mGNOBalanceAfterFifthWithdrawal = (await stake.balanceOf(accounts[1])).toString()
    expect(mGNOBalanceAfterFifthWithdrawal).to.be.equal(web3.utils.toWei('4.5'))

    await contract.processFailedWithdrawal(3, 0)

    mGNOBalanceAfterFifthWithdrawal = (await stake.balanceOf(accounts[1])).toString()
    expect(mGNOBalanceAfterFifthWithdrawal).to.be.equal(web3.utils.toWei('5'))

    await contract.processFailedWithdrawal(3, 0).should.be.rejected
    await contract.processFailedWithdrawal(4, 0).should.be.rejected
  })

  it('should claim tokens', async () => {
    const otherToken = await IERC677.new()
    await stake.transfer(contract.address, 1)
    await otherToken.transfer(contract.address, 1)

    await contract.claimTokens(otherToken.address, accounts[2], { from: accounts[1] }).should.be.rejected
    await contract.claimTokens(stake.address, accounts[2], { from: accounts[0] }).should.be.rejected
    await contract.claimTokens(otherToken.address, accounts[2], { from: accounts[0] })
    expect((await otherToken.balanceOf(accounts[2])).toString()).to.be.equal('1')
  })

  it('should upgrade', async () => {
    const impl = await SBCDepositContract.new(stake.address)
    await contractProxy.upgradeTo(impl.address, { from: accounts[1] }).should.be.rejected
    await contractProxy.upgradeTo(impl.address, { from: accounts[0] })
    expect(await contractProxy.implementation()).to.be.equal(impl.address)
  })

  it('should set admin', async () => {
    await contractProxy.setAdmin(accounts[2], { from: accounts[1] }).should.be.rejected
    await contractProxy.setAdmin(accounts[2], { from: accounts[0] })
    expect(await contractProxy.admin()).to.be.equal(accounts[2])
  })

  it('should unwrap mGNO to GNO', async () => {
    expect((await stake.balanceOf(contract.address)).toString()).to.be.equal('0')
    await token.transfer(contract.address, web3.utils.toWei('1344'))
    await contract.unwrapTokens(wrapper.address, token.address)
    expect((await stake.balanceOf(contract.address)).toString()).to.be.equal(web3.utils.toWei('42'))
  })
})
