require('dotenv').config()

const SBCDepositContract = artifacts.require('SBCDepositContract')
const SBCDepositContractProxy = artifacts.require('SBCDepositContractProxy')
const SBCToken = artifacts.require('SBCToken')
const SBCTokenProxy = artifacts.require('SBCTokenProxy')
const SBCWrapper = artifacts.require('SBCWrapper')
const SBCWrapperProxy = artifacts.require('SBCWrapperProxy')

module.exports = async function (deployer, network, accounts) {
  if (network !== 'test' && network !== 'soliditycoverage') {
    const admin = process.env.ADMIN_ACCOUNT || accounts[0]

    const name = 'mGNO'
    const symbol = 'mGNO'

    // deploy token
    await deployer.deploy(SBCTokenProxy, accounts[0], name, symbol)
    const tokenProxy = await SBCTokenProxy.deployed()
    const token = await SBCToken.at(tokenProxy.address)

    // deploy token wrapper
    await deployer.deploy(SBCWrapper, token.address)
    const wrapperImpl = await SBCWrapper.deployed()
    await deployer.deploy(SBCWrapperProxy, accounts[0], wrapperImpl.address)
    const wrapperProxy = await SBCWrapperProxy.deployed()
    const wrapper = await SBCWrapper.at(wrapperProxy.address)

    await wrapper.enableToken(process.env.STAKE_TOKEN_ADDRESS, web3.utils.toWei('32'))
    if (accounts[0].toLowerCase() !== admin.toLowerCase()) {
      await wrapperProxy.setAdmin(admin)
    }

    // set token minter to deployed wrapper
    await token.setMinter(wrapper.address)
    if (accounts[0].toLowerCase() !== admin.toLowerCase()) {
      await tokenProxy.setAdmin(admin)
    }

    // deploy deposit contract
    await deployer.deploy(SBCDepositContract, token.address)
    const depositImpl = await SBCDepositContract.deployed()
    await deployer.deploy(SBCDepositContractProxy, admin, depositImpl.address)
  }
}
