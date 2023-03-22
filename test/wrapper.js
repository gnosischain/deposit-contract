require('chai').use(require('chai-as-promised')).should()

const { stakeBytecode, makeLegacyMsg, ethSignTypedData } = require('./utils')

const SBCWrapperProxy = artifacts.require('SBCWrapperProxy.sol')
const SBCWrapper = artifacts.require('SBCWrapper.sol')
const SBCTokenProxy = artifacts.require('SBCTokenProxy.sol')
const SBCToken = artifacts.require('SBCToken.sol')
const IERC677 = artifacts.require('IERC677.sol')
const IPermittableToken = artifacts.require('IPermittableToken.sol')

const oneEther = web3.utils.toWei('1')
const twoEther = web3.utils.toWei('2')
const threeEther = web3.utils.toWei('3')
const tenEther = web3.utils.toWei('10')
const thirtyTwoEther = web3.utils.toWei('32')

contract('SBCWrapperProxy', (accounts) => {
  let tokenProxy
  let token
  let otherToken
  let wrapperProxy
  let wrapper
  let stake
  beforeEach(async () => {
    IERC677.bytecode = stakeBytecode
    stake = await IERC677.new()
    tokenProxy = await SBCTokenProxy.new(accounts[0], 'SBC Token', 'SBCT')
    token = await SBCToken.at(tokenProxy.address)
    wrapperProxy = await SBCWrapperProxy.new(accounts[0], token.address, accounts[1])
    wrapper = await SBCWrapper.at(wrapperProxy.address)
    await token.setMinter(wrapper.address)

    await wrapper.enableToken(stake.address, oneEther)
    otherToken = await IERC677.new()
    await stake.approve(wrapper.address, tenEther)
    await otherToken.approve(wrapper.address, tenEther)
  })

  it('should swap only enabled tokens', async () => {
    expect((await wrapper.tokenStatus(stake.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(stake.address)).toString()).to.be.equal(oneEther)
    expect((await wrapper.tokenStatus(otherToken.address)).toString()).to.be.equal('0')
    expect((await wrapper.tokenRate(otherToken.address)).toString()).to.be.equal('0')

    await stake.transferAndCall(wrapper.address, oneEther, '0x')
    await wrapper.swap(stake.address, oneEther, '0x')

    expect((await token.totalSupply()).toString()).to.be.equal(twoEther)
    expect((await token.balanceOf(accounts[0])).toString()).to.be.equal(twoEther)

    await otherToken.transferAndCall(wrapper.address, oneEther, '0x').should.be.rejected
    await wrapper.swap(otherToken.address, oneEther, '0x').should.be.rejected

    await wrapper.enableToken(otherToken.address, web3.utils.toWei('2'))

    expect((await wrapper.tokenStatus(stake.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(stake.address)).toString()).to.be.equal(oneEther)
    expect((await wrapper.tokenStatus(otherToken.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(otherToken.address)).toString()).to.be.equal(twoEther)

    await otherToken.transferAndCall(wrapper.address, oneEther, '0x')
    await wrapper.swap(otherToken.address, oneEther, '0x')

    expect((await token.totalSupply()).toString()).to.be.equal(web3.utils.toWei('6'))
    expect((await token.balanceOf(accounts[0])).toString()).to.be.equal(web3.utils.toWei('6'))
  })

  it('should pause single token', async () => {
    await wrapper.enableToken(otherToken.address, twoEther)

    expect((await wrapper.tokenStatus(stake.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(stake.address)).toString()).to.be.equal(oneEther)
    expect((await wrapper.tokenStatus(otherToken.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(otherToken.address)).toString()).to.be.equal(twoEther)

    await stake.transferAndCall(wrapper.address, oneEther, '0x')
    await wrapper.swap(stake.address, oneEther, '0x')
    await otherToken.transferAndCall(wrapper.address, oneEther, '0x')
    await wrapper.swap(otherToken.address, oneEther, '0x')

    await wrapper.pauseToken(otherToken.address)

    expect((await wrapper.tokenStatus(stake.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(stake.address)).toString()).to.be.equal(oneEther)
    expect((await wrapper.tokenStatus(otherToken.address)).toString()).to.be.equal('2')
    expect((await wrapper.tokenRate(otherToken.address)).toString()).to.be.equal(twoEther)

    await stake.transferAndCall(wrapper.address, oneEther, '0x')
    await wrapper.swap(stake.address, oneEther, '0x')
    await otherToken.transferAndCall(wrapper.address, oneEther, '0x').should.be.rejected
    await wrapper.swap(otherToken.address, oneEther, '0x').should.be.rejected

    await wrapper.enableToken(otherToken.address, threeEther)

    expect((await wrapper.tokenStatus(stake.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(stake.address)).toString()).to.be.equal(oneEther)
    expect((await wrapper.tokenStatus(otherToken.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(otherToken.address)).toString()).to.be.equal(threeEther)
  })

  it('should pause all tokens', async () => {
    await wrapper.enableToken(otherToken.address, twoEther)

    await wrapper.pause({ from: accounts[1] }).should.be.rejected
    await wrapper.pause({ from: accounts[0] })

    await stake.transferAndCall(wrapper.address, oneEther, '0x').should.be.rejected
    await wrapper.swap(stake.address, oneEther, '0x').should.be.rejected
    await otherToken.transferAndCall(wrapper.address, oneEther, '0x').should.be.rejected
    await wrapper.swap(otherToken.address, oneEther, '0x').should.be.rejected

    await wrapper.unpause({ from: accounts[1] }).should.be.rejected
    await wrapper.unpause({ from: accounts[0] })

    await stake.transferAndCall(wrapper.address, oneEther, '0x')
    await wrapper.swap(stake.address, oneEther, '0x')
    await otherToken.transferAndCall(wrapper.address, oneEther, '0x')
    await wrapper.swap(otherToken.address, oneEther, '0x')
  })

  it('should allow to claim disabled tokens', async () => {
    const disabledToken = await IERC677.new()
    await wrapper.enableToken(otherToken.address, twoEther)
    await wrapper.pauseToken(otherToken.address)

    await stake.transfer(wrapper.address, 1)
    await otherToken.transfer(wrapper.address, 1)
    await disabledToken.transfer(wrapper.address, 1)

    await wrapper.claimTokens(stake.address, accounts[1], { from: accounts[1] }).should.be.rejected
    await wrapper.claimTokens(otherToken.address, accounts[1], { from: accounts[1] }).should.be.rejected
    await wrapper.claimTokens(disabledToken.address, accounts[1], { from: accounts[1] }).should.be.rejected
    await wrapper.claimTokens(stake.address, accounts[1], { from: accounts[0] }).should.be.rejected
    await wrapper.claimTokens(otherToken.address, accounts[1], { from: accounts[0] }).should.be.rejected
    await wrapper.claimTokens(disabledToken.address, accounts[1], { from: accounts[0] })

    expect((await disabledToken.balanceOf(accounts[1])).toString()).to.be.equal('1')
  })

  it('should swap through permit', async () => {
    const permittable = await IPermittableToken.at(stake.address)
    const domain = {
      name: 'STAKE',
      version: '1',
      chainId: 1,
      verifyingContract: stake.address
    }
    const legacyMsg = makeLegacyMsg(domain, accounts[0], wrapper.address, 0, '9999999999999', true)
    const legacySig = await ethSignTypedData(accounts[0], legacyMsg)
    const legacyPermit = permittable.contract.methods['permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)']
    const legacyData = await legacyPermit(accounts[0], wrapper.address, 0, '9999999999999', true, ...legacySig).encodeABI()

    await stake.approve(wrapper.address, '0')
    await wrapper.swap(stake.address, oneEther, '0x').should.be.rejected
    await wrapper.swap(stake.address, oneEther, '0x11223344').should.be.rejected
    await wrapper.swap(stake.address, oneEther, '0x1122334455').should.be.rejected
    await wrapper.swap(stake.address, oneEther, legacyData)

    expect((await stake.balanceOf(wrapper.address)).toString()).to.be.equal(oneEther)
    expect((await token.balanceOf(accounts[0])).toString()).to.be.equal(oneEther)
  })

  it('should unwrap only enabled tokens', async () => {
    expect((await wrapper.tokenStatus(stake.address)).toString()).to.be.equal('1')
    expect((await wrapper.tokenRate(stake.address)).toString()).to.be.equal(oneEther)
    expect((await wrapper.tokenStatus(otherToken.address)).toString()).to.be.equal('0')
    expect((await wrapper.tokenRate(otherToken.address)).toString()).to.be.equal('0')

    {
      await wrapper.enableToken(stake.address, thirtyTwoEther)
      expect((await wrapper.tokenStatus(stake.address)).toString()).to.be.equal('1')
      expect((await wrapper.tokenRate(stake.address)).toString()).to.be.equal(thirtyTwoEther)

      expect((await token.balanceOf(accounts[0])).toString()).to.be.equal('0')
      const balanceBeforeWrap = parseInt((await stake.balanceOf(accounts[0])).toString())
      await wrapper.swap(stake.address, oneEther, '0x')
      expect((await token.balanceOf(accounts[0])).toString()).to.be.equal(thirtyTwoEther)
      await wrapper.unwrap(stake.address, thirtyTwoEther)
      const balanceAfterUnwrap = parseInt((await stake.balanceOf(accounts[0])).toString())
      expect((await token.balanceOf(accounts[0])).toString()).to.be.equal('0')
      expect(balanceAfterUnwrap).to.be.equal(balanceBeforeWrap)
    }


    await wrapper.unwrap(otherToken.address, oneEther).should.be.rejected

    {
      await wrapper.enableToken(otherToken.address, tenEther)
      expect((await wrapper.tokenStatus(otherToken.address)).toString()).to.be.equal('1')
      expect((await wrapper.tokenRate(otherToken.address)).toString()).to.be.equal(tenEther)

      expect((await token.balanceOf(accounts[0])).toString()).to.be.equal('0')
      const balanceBeforeWrap = parseInt((await otherToken.balanceOf(accounts[0])).toString())
      await wrapper.swap(otherToken.address, oneEther, '0x')
      expect((await token.balanceOf(accounts[0])).toString()).to.be.equal(tenEther)
      await wrapper.unwrap(otherToken.address, tenEther)
      const balanceAfterUnwrap = parseInt((await otherToken.balanceOf(accounts[0])).toString())
      expect((await token.balanceOf(accounts[0])).toString()).to.be.equal('0')
      expect(balanceAfterUnwrap).to.be.equal(balanceBeforeWrap)
    }
  })

  it('should upgrade', async () => {
    const impl = await SBCWrapper.new(token.address, accounts[1])
    await wrapperProxy.upgradeTo(impl.address, { from: accounts[1] }).should.be.rejected
    await wrapperProxy.upgradeTo(impl.address, { from: accounts[0] })
    expect(await wrapperProxy.implementation()).to.be.equal(impl.address)
  })

  it('should set admin', async () => {
    await wrapperProxy.setAdmin(accounts[2], { from: accounts[1] }).should.be.rejected
    await wrapperProxy.setAdmin(accounts[2], { from: accounts[0] })
    expect(await wrapperProxy.admin()).to.be.equal(accounts[2])
  })
})
