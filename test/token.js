require('chai').use(require('chai-as-promised')).should()

const SBCWrapperProxy = artifacts.require('SBCWrapperProxy.sol')
const SBCWrapper = artifacts.require('SBCWrapper.sol')
const SBCTokenProxy = artifacts.require('SBCTokenProxy.sol')
const SBCToken = artifacts.require('SBCToken.sol')
const PermittableToken = artifacts.require('PermittableToken.sol')

const oneEther = web3.utils.toWei('1')

contract('SBCTokenProxy', (accounts) => {
  let tokenProxy
  let token
  let wrapperProxy
  let wrapper
  let stake
  beforeEach(async () => {
    stake = await PermittableToken.new('Test token', 'TEST', 18, 1337)
    await stake.mint(accounts[0], web3.utils.toWei('1000'))
    tokenProxy = await SBCTokenProxy.new(accounts[0], 'SBC Token', 'SBCT')
    token = await SBCToken.at(tokenProxy.address)
    wrapperProxy = await SBCWrapperProxy.new(accounts[0], token.address, accounts[1])
    wrapper = await SBCWrapper.at(wrapperProxy.address)
    await token.setMinter(wrapper.address)

    await wrapper.enableToken(stake.address, oneEther)
  })

  it('should setup correct metadata', async () => {
    expect(await token.name()).to.be.equal('SBC Token')
    expect(await token.symbol()).to.be.equal('SBCT')
    expect((await token.decimals()).toString()).to.be.equal('18')
  })

  it('should pause all operations', async () => {
    await stake.transferAndCall(wrapper.address, oneEther, '0x')
    await token.transfer(accounts[1], 1)

    await token.pause({ from: accounts[1] }).should.be.rejected
    await token.pause({ from: accounts[0] })

    await stake.transferAndCall(wrapper.address, oneEther, '0x').should.be.rejected
    await token.transfer(accounts[1], 1).should.be.rejected

    await token.unpause({ from: accounts[1] }).should.be.rejected
    await token.unpause({ from: accounts[0] })

    await stake.transferAndCall(wrapper.address, oneEther, '0x')
    await token.transfer(accounts[1], 1)
  })

  it('should claim tokens', async () => {
    await stake.transferAndCall(wrapper.address, oneEther, '0x')
    await token.transfer(token.address, 1)

    await token.claimTokens(token.address, accounts[1], { from: accounts[1] }).should.be.rejected
    await token.claimTokens(token.address, accounts[1], { from: accounts[0] })

    expect((await token.balanceOf(accounts[1])).toString()).to.be.equal('1')
  })

  it('should upgrade', async () => {
    const impl = await SBCToken.new()
    await tokenProxy.upgradeTo(impl.address, { from: accounts[1] }).should.be.rejected
    await tokenProxy.upgradeTo(impl.address, { from: accounts[0] })
    expect(await tokenProxy.implementation()).to.be.equal(impl.address)
  })

  it('should set admin', async () => {
    await tokenProxy.setAdmin(accounts[2], { from: accounts[1] }).should.be.rejected
    await tokenProxy.setAdmin(accounts[2], { from: accounts[0] })
    expect(await tokenProxy.admin()).to.be.equal(accounts[2])
  })
})
