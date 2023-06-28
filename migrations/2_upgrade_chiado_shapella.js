require('dotenv').config()

const SBCDepositContractProxy = artifacts.require('SBCDepositContractProxy')
const SBCDepositContract = artifacts.require('SBCDepositContract')

module.exports = async function (deployer, network, accounts) {
  if (network !== 'test' && network !== 'soliditycoverage') {
    const gnoTokenProxyAddress = process.env.GNO_TOKEN_PROXY_ADDRESS
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
  }
}