require('dotenv').config()

const SBCDepositContractProxy = artifacts.require('SBCDepositContractProxy')
const SBCToken = artifacts.require('SBCToken')
const SBCTokenProxy = artifacts.require('SBCTokenProxy')
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

    // deploy token wrapper
    await deployer.deploy(SBCWrapperProxy, admin, token.address)
    const wrapper = await SBCWrapperProxy.deployed()

    // set token minter to deployed wrapper
    await token.setMinter(wrapper.address)
    if (accounts[0].toLowerCase() !== admin.toLowerCase()) {
      await tokenProxy.setAdmin(admin)
    }

    // deploy deposit contract
    await deployer.deploy(SBCDepositContractProxy, admin, token.address)
  }
}
