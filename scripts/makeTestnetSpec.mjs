import fs from "node:fs";
import path from "node:path";
import Web3 from "web3";

// Constructs a transaction to be added to the chainspec to deploy all contracts in one go

const admin = "0x1000000000000000000000000000000000000000";
const initialStakeMGNO = 10_000 * 32; // 10_000 validators

const web3 = new Web3();

async function main() {
  const SBCTesnetDeployerDeployTx = deployTx("SBCTesnetDeployer", [
    // address _admin,
    // uint256 _initialStake,
    admin,
    web3.utils.toWei(String(initialStakeMGNO)),
  ]);

  fs.writeFileSync("SBCTesnetDeployer.deploytx.txt", SBCTesnetDeployerDeployTx);
}

/**
 * @param {string} contractName
 * @returns {{abi: unknown, bytecode: string}}
 */
function getBuildArtifacts(contractName) {
  const str = fs.readFileSync(path.join("build", "contracts", `${contractName}.json`));
  return JSON.parse(str);
}

/**
 * @param {string} contractName
 * @param {unknown[]} args
 * @returns {string}
 */
function deployTx(contractName, args) {
  const contractJson = getBuildArtifacts(contractName);
  const contract = new web3.eth.Contract(contractJson.abi);
  return contract
    .deploy({
      data: contractJson.bytecode,
      arguments: args,
    })
    .encodeABI();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
