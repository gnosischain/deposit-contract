require('dotenv').config()

const SBCDepositContractProxy = artifacts.require('SBCDepositContractProxy')
const SBCDepositContract = artifacts.require('SBCDepositContract')
const SBCToken = artifacts.require('SBCToken')
const SBCTokenProxy = artifacts.require('SBCTokenProxy')
const SBCWrapper = artifacts.require('SBCWrapper')
const SBCWrapperProxy = artifacts.require('SBCWrapperProxy')

module.exports = async function (deployer, network, accounts) {
  if (network !== 'test' && network !== 'soliditycoverage') {
    const admin = process.env.ADMIN_ACCOUNT || accounts[0]

    const name = 'SBC Token'
    const symbol = 'SBCT'

    // deploy token
    await deployer.deploy(SBCTokenProxy, accounts[0], name, symbol)
    const tokenProxy = await SBCTokenProxy.deployed()
    const token = await SBCToken.at(tokenProxy.address)

    // deploy deposit contract
    await deployer.deploy(SBCDepositContractProxy, accounts[0], token.address)
    const depositContractProxy = await SBCDepositContractProxy.deployed()

    // deploy token wrapper
    await deployer.deploy(SBCWrapperProxy, accounts[0], token.address, depositContractProxy.address)
    const wrapperProxy = await SBCWrapperProxy.deployed()
    const wrapper = await SBCWrapper.at(wrapperProxy.address)

    // upgrade deposit with the correct unwrapper address
    await deployer.deploy(SBCDepositContract, token.address)
    const depositContractImplementationWithUnwrapper = await SBCDepositContract.deployed()
    await depositContractProxy.upgradeTo(depositContractImplementationWithUnwrapper.address)

    if (accounts[0].toLowerCase() !== admin.toLowerCase()) {
      await depositContractProxy.setAdmin(admin)
    }

    // set token minter to deployed wrapper
    await token.setMinter(wrapper.address)
    if (accounts[0].toLowerCase() !== admin.toLowerCase()) {
      await tokenProxy.setAdmin(admin)
    }

    await wrapper.enableToken(process.env.STAKE_TOKEN_ADDRESS, web3.utils.toWei('32'))
    if (accounts[0].toLowerCase() !== admin.toLowerCase()) {
      await wrapperProxy.setAdmin(admin)
    }
  }
}
