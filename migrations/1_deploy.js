require('dotenv').config()

const StakeDepositContractProxy = artifacts.require('StakeDepositContractProxy')

module.exports = function(deployer, _, accounts) {
  deployer.deploy(StakeDepositContractProxy, process.env.ADMIN_ACCOUNT || accounts[0], process.env.STAKE_TOKEN_ADDRESS)
}
