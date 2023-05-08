const { expect } = require("chai");

const SBCDepositContract = artifacts.require("SBCDepositContract");
const UnsafeToken = artifacts.require("UnsafeToken");

// # How to use
//
// Setup:
// - Create a .env file
// - Set DEVNET_ACCOUNT_PRIVATE_KEY to the deposit contract admin private key
// - Set DEVNET3_RPC_URL to an execution client endpoint
// - Grab deposit address from `config.yml -> DEPOSIT_CONTRACT_ADDRESS` and set it to `DEPOSIT_CONTRACT_ADDRESS` env
//
// Run:
// ```
// npx truffle exec scripts/test_withdrawals_prod.js --network devnet3
// ```

async function main() {
  const admin = (await web3.eth.getAccounts())[0];
  console.log(`connected account ${admin} - must be admin`);

  const depositContractAddress = process.env.DEPOSIT_CONTRACT_ADDRESS;
  const depositContract = new web3.eth.Contract(SBCDepositContract.abi, depositContractAddress);
  const stakeTokenAddress = await depositContract.methods.stake_token().call();
  const stakeToken = new web3.eth.Contract(UnsafeToken.abi, stakeTokenAddress);
  console.log(`deposit contract ${depositContractAddress}`, {
    stake_token: stakeTokenAddress,
    deposit_root: await depositContract.methods.get_deposit_root().call(),
    numberOfFailedWithdrawals: await depositContract.methods.numberOfFailedWithdrawals().call(),
    failedWithdrawalsPointer: await depositContract.methods.failedWithdrawalsPointer().call(),
  });

  // - [ ] Send BLS credential changes to some portion of genesis validators
  // >> TODO

  // - [x] Assert partial withdrawals happening correctly
  await assertPartialWithdrawalsHappening(stakeToken);

  // - [ ] Send VoluntaryExit for some portion of genesis validators with BLS credentials
  // >> TODO

  // - [ ] Assert full withdrawals happening correctly
  // >> TODO

  try {
    // - Drain deposit contract of all funds (with `stealFrom`)
    //   - Check deposit contract state
    const depositContractStakeBalancePre = await stakeToken.methods.balanceOf(depositContractAddress).call();
    console.log("deposit contract stake token balance", depositContractStakeBalancePre);
    await drainDepositContract(stakeToken, depositContractAddress, admin);

    // - Assert backlog of withdrawals accumulates
    //   - Check that `SBCDepositContract.numberOfFailedWithdrawals() > 0`
    //   - Query some indexes of `SBCDepositContract.failedWithdrawals(i)` and assert withdraw data matches that of blocks
    await assertPartialWithdrawalsNOTHappening(stakeToken);
    await assertFailedWithdrawalsPersisted(depositContract);

    // - Refund deposit contract
    await refundDepositContract(stakeToken, depositContractAddress, admin);

    // - Assert partial withdrawals are happening correctly again
    await assertPartialWithdrawalsHappening(stakeToken);

    // - Assert failedWithdrawals queue is being cleared (check that `failedWithdrawalsPointer` > 0` and eventually `numberOfFailedWithdrawals == failedWithdrawalsPointer`
    await assertFailedWithdrawalsQueueCleared(depositContract);
  } catch (e) {
    // Prevent leaving the network withdrawal's dead
    await refundDepositContract(stakeToken, depositContractAddress, admin);
    throw e;
  }
}

async function assertPartialWithdrawalsHappening(stakeToken) {
  const block = await web3.eth.getBlock(await web3.eth.getBlockNumber());

  const gweiMgnoPerAccount = accumulateGweiMGnoPerAccount(block);
  console.log(
    `Asserting withdrawals happening for block ${block.number} has ${block.withdrawals.length} withdrawals`,
    gweiMgnoPerAccount
  );

  for (const [address, gweiMgno] of gweiMgnoPerAccount) {
    // May not be precise, since other block transactions can change the balance of address
    const weiGnoDiff = await getWeiGnoDiff(stakeToken, block, address);
    const expectedWeiGnoDiff = BigInt(gweiMgno) * BigInt(1e9 / 32);
    expect(weiGnoDiff, expectedWeiGnoDiff, `not exact withdraw amount for ${address} block ${block.hash}`);
  }
}

async function assertPartialWithdrawalsNOTHappening(stakeToken) {
  const block = await web3.eth.getBlock(await web3.eth.getBlockNumber());

  const gweiMgnoPerAccount = accumulateGweiMGnoPerAccount(block);
  console.log(
    `Asserting withdrawals NOT happening for block ${block.number} has ${block.withdrawals.length} withdrawals`,
    gweiMgnoPerAccount
  );

  for (const [address, gweiMgno] of gweiMgnoPerAccount) {
    if (gweiMgno > 0) {
      // May not be precise, since other block transactions can change the balance of address
      const weiGnoDiff = await getWeiGnoDiff(stakeToken, block, address);
      expect(weiGnoDiff, BigInt(0), `Expected not applied withdrawal for ${address} block ${block.hash}`);
    }
  }
}

async function assertFailedWithdrawalsPersisted(depositContract) {
  const block = await web3.eth.getBlock(await web3.eth.getBlockNumber());

  const numberOfFailedWithdrawals = toNum(
    await depositContract.methods.numberOfFailedWithdrawals().call({}, block.hash)
  );

  for (let i = 0; i < block.withdrawals.length; i++) {
    const failedWithdrawalIdx = numberOfFailedWithdrawals - 1 - i;
    const withdrawalIdx = block.withdrawals.length - 1 - i;
    const withdrawal = block.withdrawals[withdrawalIdx];
    const failedWithdrawal = await depositContract.methods.failedWithdrawals(failedWithdrawalIdx).call({}, block.hash);
    expect(
      { amount: BigInt(failedWithdrawal.amount), receiver: failedWithdrawal.receiver },
      { amount: BigInt(toNum(withdrawal.amount)) * BigInt(1e9 / 32), receiver: withdrawal.address },
      `wrong persisted block withdrawal ${withdrawalIdx}`
    );
  }

  console.log(`Correct persisted failed withdrawals for block ${block.hash}`);
}

async function assertFailedWithdrawalsQueueCleared(depositContract) {
  let prevBlockNumber = 0;
  while (true) {
    // Poll for new block every 0.5 sec
    const blockNumber = await web3.eth.getBlockNumber();
    if (blockNumber === prevBlockNumber) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    } else {
      prevBlockNumber = blockNumber;
    }

    const [numberOfFailedWithdrawals, failedWithdrawalsPointer] = await Promise.all([
      toNum(await depositContract.methods.numberOfFailedWithdrawals().call({}, blockNumber)),
      toNum(await depositContract.methods.failedWithdrawalsPointer().call({}, blockNumber)),
    ]);

    if (failedWithdrawalsPointer < numberOfFailedWithdrawals) {
      console.log(
        `block ${blockNumber} clearing failed withdrawals queue ptr ${failedWithdrawalsPointer} < ${numberOfFailedWithdrawals}`
      );
    } else {
      console.log(`block ${blockNumber} failed withdrawals queue cleared`);
      return;
    }
  }
}

async function drainDepositContract(stakeToken, depositContractAddress, admin) {
  await stakeToken.methods
    .stealFrom(depositContractAddress, BigInt(2) ** BigInt(255))
    .send({ from: admin, gasLimit: 500_000, gasPrice: 2_000_000_000 });
  console.log(
    "deposit contract balance after stealFrom",
    await stakeToken.methods.balanceOf(depositContractAddress).call()
  );
}

async function refundDepositContract(stakeToken, depositContractAddress, admin) {
  await stakeToken.methods
    .transfer(depositContractAddress, await stakeToken.methods.balanceOf(admin).call())
    .send({ from: admin, gasLimit: 500_000, gasPrice: 2_000_000_000 });
  console.log(
    "deposit contract balance after returning funds",
    await stakeToken.methods.balanceOf(depositContractAddress).call()
  );
}

// {
//   index: '0x4242d1',
//   validatorIndex: '0x53f',
//   address: '0x7b380660b3e857971ffc04a7ada5ce563acf9f31',
//   amount: '0x1f93cb'
// },
function accumulateGweiMGnoPerAccount(block) {
  if (block.withdrawals.length === 0) {
    throw Error(`Block ${block.number} withdrawals are empty`);
  }

  const gweiMgnoPerAccount = new Map();
  for (const { address, amount } of block.withdrawals) {
    gweiMgnoPerAccount.set(address, parseInt(amount) + (gweiMgnoPerAccount.get(address) ?? 0));
  }
  return gweiMgnoPerAccount;
}

async function getWeiGnoDiff(stakeToken, block, address) {
  const weiGnoBefore = await stakeToken.methods.balanceOf(address).call({}, block.parentHash);
  const weiGnoAfter = await stakeToken.methods.balanceOf(address).call({}, block.hash);
  return BigInt(weiGnoAfter) - BigInt(weiGnoBefore);
}

function toNum(numStr) {
  const num = parseInt(numStr);
  if (isNaN(num)) {
    throw Error(`${numStr} is not a number`);
  }
  return num;
}

module.exports = async function (callback) {
  try {
    await main();
  } catch (e) {
    console.error(e);
  }

  callback();
};
