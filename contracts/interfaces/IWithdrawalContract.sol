// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

interface IWithdrawalContract {
    /**
     * @dev Function to be used only in the system transaction.
     * Call to this function will revert only in three cases:
     *     - the caller is not `SYSTEM_WITHDRAWAL_EXECUTOR` or `_admin()`;
     *     - the length of `_amounts` array is not equal to the length of `_addresses` array;
     *     - the call ran out of gas.
     * Call to this function doesn't transmit flow control to any untrusted contract,
     * so using constant gas limit and constant number of withdrawals for calls of this function is ok.
     * @param _amounts Array of amounts to be withdrawn.
     * @param _addresses Array of addresses that should receive the corresponding amount of tokens.
     */
    function executeSystemWithdrawals(uint64[] calldata _amounts, address[] calldata _addresses) external;

    /// @notice Executed withdrawal event.
    event WithdrawalExecuted(uint256 _amount, address indexed _address);

    /// @notice Failed withdrawal event.
    event WithdrawalFailed(uint256 indexed _failedWithdrawalId, uint256 _amount, address indexed _address);

    /**
     * @dev Function to be used to process failed withdrawals.
     * Call to this function will revert only if it ran out of gas.
     * Call to this function doesn't transmit flow control to any untrusted contract,
     * so using constant gas limit and constant max number of withdrawals for calls of this function is ok.
     * @param _maxNumberOfFailedWithdrawalsToProcess Maximum number of failed withdrawals to be processed.
     */
    function processFailedWithdrawalsFromPointer(uint256 _maxNumberOfFailedWithdrawalsToProcess) external;

    /**
     * @dev Function to be used to process a failed withdrawal (possibly partially).
     * @param _failedWithdrawalId Id of a failed withdrawal.
     * @param _amountToProceed Amount of token to withdraw (for the case it is impossible to withdraw the full amount)
     * (available only for the receiver, will be ignored if other account tries to process the withdrawal).
     * @param _unwrapToGNO Indicator of whether tokens should be converted to GNO or not
     * (available only for the receiver, will be ignored if other account tries to process the withdrawal).
     */
    function processFailedWithdrawal(
        uint256 _failedWithdrawalId,
        uint256 _amountToProceed,
        bool _unwrapToGNO
    ) external;

    /// @notice Processed (possibly partially) failed withdrawal event.
    event FailedWithdrawalProcessed(
        uint256 indexed _failedWithdrawalId,
        uint256 _processedAmount,
        address indexed _address
    );
}
