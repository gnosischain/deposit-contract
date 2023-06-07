// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

interface IWithdrawalContract {
    /**
     * @dev Function to be used only in the system transaction.
     * Call to this function will revert only in three cases:
     *     - the caller is not `SYSTEM_WITHDRAWAL_EXECUTOR` or `_admin()`;
     *     - the length of `_amounts` array is not equal to the length of `_addresses` array;
     *     - it is a reentrant access to failed withdrawals processing;
     *     - the call ran out of gas.
     * Call to this function doesn't transmit flow control to any untrusted contract and uses a constant gas limit for each withdrawal,
     * so using constant gas limit and constant number of withdrawals (including failed withdrawals) for calls of this function is ok.
     * @param _maxNumberOfFailedWithdrawalsToProcess Maximum number of failed withdrawals to be processed.
     * @param _amounts Array of amounts to be withdrawn.
     * @param _addresses Array of addresses that should receive the corresponding amount of tokens.
     */
    function executeSystemWithdrawals(
        uint256 _maxNumberOfFailedWithdrawalsToProcess,
        uint64[] calldata _amounts,
        address[] calldata _addresses
    ) external;
}
