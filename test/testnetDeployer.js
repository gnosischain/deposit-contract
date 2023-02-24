require("chai").use(require("chai-as-promised")).should();

const SBCTesnetDeployer = artifacts.require("SBCTesnetDeployer.sol");

const initialStake = web3.utils.toWei("32");

contract("SBCTesnetDeployer", (accounts) => {
  let testnetDeployer;

  beforeEach(async () => {
    testnetDeployer = await SBCTesnetDeployer.new(accounts[0], initialStake);
  });

  it.only("Should deploy and collect addresses", async () => {
    console.log(await testnetDeployer.get_addresses());
  });
});
