# Stake Beacon Chain Deposit Contract

This is a rewrite of the official beacon chain deposit contract. [Eth 2.0 deposit contract](https://github.com/ethereum/eth2.0-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol).

The following things were changed:
* Deposit is made via ERC20 tokens instead of native ETH
* Contract can be made upgradeable
* Contract can be made claimable (allowing to claim mistakenly sent third-party tokens back)

## Compiling solidity deposit contract

```sh
yarn compile
```

## Running web3 tests

```sh
yarn test
```
