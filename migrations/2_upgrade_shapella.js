require('dotenv').config()

const SBCDepositContractProxy = artifacts.require('SBCDepositContractProxy')
const SBCDepositContract = artifacts.require('SBCDepositContract')
const SBCToken = artifacts.require('SBCToken')
const SBCTokenProxy = artifacts.require('SBCTokenProxy')
const SBCWrapper = artifacts.require('SBCWrapper')
const SBCWrapperProxy = artifacts.require('SBCWrapperProxy')

module.exports = async function (deployer, network, accounts) {
  if (network !== 'test' && network !== 'soliditycoverage') {
    const gnoTokenProxyAddress = process.env.GNO_TOKEN_PROXY_ADDRESS
    const mgnoTokenProxyAddress = process.env.MGNO_TOKEN_PROXY_ADDRESS
    const wrapperProxyAddress = process.env.WRAPPER_PROXY_ADDRESS
    const depositContractProxyAddress = process.env.DEPOSIT_CONTRACT_PROXY_ADDRESS

    // deploy deposit contract implementation
    // ```
    // constructor(address _token)
    // ```
    await deployer.deploy(SBCDepositContract, gnoTokenProxyAddress)
    const depositContractImplementation = await SBCDepositContract.deployed()
    // upgrade deposit with the correct unwrapper address
    const depositContractProxy = await SBCDepositContractProxy.at(depositContractProxyAddress)
    await depositContractProxy.upgradeTo(depositContractImplementation.address)

    // # upgrade MGNO token contract
    // ## deploy new SBCToken, with burn functionality
    // ```
    // constructor()
    // ```
    await deployer.deploy(SBCToken)
    const mgnoTokenImplementation = SBCToken.deployed()
    // upgrade existing SBCTokenProxy to new implementation
    const mgnoTokenProxy = await SBCTokenProxy.at(wrapperProxyAddress)
    await mgnoTokenProxy.upgradeTo(mgnoTokenImplementation.address)

    // # upgrade wrapper contract
    // ## deploy new SBCWrapper, with unwrap functionality
    // ```
    // constructor(SBCToken _sbcToken, SBCDepositContract _depositContract)
    // ```
    await deployer.deploy(SBCWrapper, mgnoTokenProxyAddress, depositContractProxyAddress)
    const wrapperImplementation = SBCWrapper.deployed()
    // upgrade existing SBCWrapperProxy to new implementation
    const wrapperProxy = await SBCWrapperProxy.at(wrapperProxyAddress)
    await wrapperProxy.upgradeTo(wrapperImplementation.address)

    // unwrap deposit contract held mGNO to GNO
    const depositContract = await SBCDepositContract.at(depositContractProxyAddress)
    await depositContract.unwrapTokens(wrapperProxyAddress, mgnoTokenProxyAddress)
  }
}
