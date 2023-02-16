// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./interfaces/IDepositContract.sol";
import "./interfaces/IERC677Receiver.sol";
import "./interfaces/IUnwrapper.sol";
import "./interfaces/IWithdrawalContract.sol";
import "./utils/PausableEIP1967Admin.sol";
import "./utils/Claimable.sol";

/**
 * @title SBCDepositContract
 * @dev Implementation of the ERC20 ETH2.0 deposit contract.
 * For the original implementation, see the Phase 0 specification under https://github.com/ethereum/eth2.0-specs
 */
contract SBCDepositContract is
    IDepositContract,
    IERC165,
    IERC677Receiver,
    PausableEIP1967Admin,
    Claimable,
    IWithdrawalContract
{
    using SafeERC20 for IERC20;

    uint256 private constant DEPOSIT_CONTRACT_TREE_DEPTH = 32;
    // NOTE: this also ensures `deposit_count` will fit into 64-bits
    uint256 private constant MAX_DEPOSIT_COUNT = 2**DEPOSIT_CONTRACT_TREE_DEPTH - 1;

    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private zero_hashes;

    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private branch;
    uint256 private deposit_count;

    mapping(bytes => bytes32) public validator_withdrawal_credentials;

    IERC20 public immutable stake_token;

    constructor(
        address _token,
        address _stakeTokenUnwrapper,
        address _GNOTokenAddress
    ) {
        stake_token = IERC20(_token);
        stakeTokenUnwrapper = IUnwrapper(_stakeTokenUnwrapper);
        GNOTokenAddress = IERC20(_GNOTokenAddress);
    }

    function get_deposit_root() external view override returns (bytes32) {
        bytes32 node;
        uint256 size = deposit_count;
        for (uint256 height = 0; height < DEPOSIT_CONTRACT_TREE_DEPTH; height++) {
            if ((size & 1) == 1) {
                node = sha256(abi.encodePacked(branch[height], node));
            } else {
                node = sha256(abi.encodePacked(node, zero_hashes[height]));
            }
            size /= 2;
        }
        return sha256(abi.encodePacked(node, to_little_endian_64(uint64(deposit_count)), bytes24(0)));
    }

    function get_deposit_count() external view override returns (bytes memory) {
        return to_little_endian_64(uint64(deposit_count));
    }

    function deposit(
        bytes memory pubkey,
        bytes memory withdrawal_credentials,
        bytes memory signature,
        bytes32 deposit_data_root,
        uint256 stake_amount
    ) external override whenNotPaused {
        stake_token.transferFrom(msg.sender, address(this), stake_amount);
        _deposit(pubkey, withdrawal_credentials, signature, deposit_data_root, stake_amount);
    }

    function batchDeposit(
        bytes calldata pubkeys,
        bytes calldata withdrawal_credentials,
        bytes calldata signatures,
        bytes32[] calldata deposit_data_roots
    ) external whenNotPaused {
        uint256 count = deposit_data_roots.length;
        require(count > 0, "BatchDeposit: You should deposit at least one validator");
        require(count <= 128, "BatchDeposit: You can deposit max 128 validators at a time");

        require(pubkeys.length == count * 48, "BatchDeposit: Pubkey count don't match");
        require(signatures.length == count * 96, "BatchDeposit: Signatures count don't match");
        require(withdrawal_credentials.length == 32, "BatchDeposit: Withdrawal Credentials count don't match");

        uint256 stake_amount = 32 ether;
        stake_token.transferFrom(msg.sender, address(this), stake_amount * count);

        for (uint256 i = 0; i < count; ++i) {
            bytes memory pubkey = bytes(pubkeys[i * 48:(i + 1) * 48]);
            bytes memory signature = bytes(signatures[i * 96:(i + 1) * 96]);

            _deposit(pubkey, withdrawal_credentials, signature, deposit_data_roots[i], stake_amount);
        }
    }

    function onTokenTransfer(
        address,
        uint256 stake_amount,
        bytes calldata data
    ) external override whenNotPaused returns (bool) {
        require(msg.sender == address(stake_token), "DepositContract: not a deposit token");
        require(data.length % 176 == 32, "DepositContract: incorrect deposit data length");
        uint256 count = data.length / 176;
        require(count > 0, "BatchDeposit: You should deposit at least one validator");
        uint256 stake_amount_per_deposit = stake_amount;
        if (count > 1) {
            require(count <= 128, "BatchDeposit: You can deposit max 128 validators at a time");
            require(stake_amount == 32 ether * count, "BatchDeposit: batch deposits require 32 SBC deposit amount");
            stake_amount_per_deposit = 32 ether;
        }

        bytes memory withdrawal_credentials = data[0:32];
        for (uint256 p = 32; p < data.length; p += 176) {
            bytes memory pubkey = data[p:p + 48];
            bytes memory signature = data[p + 48:p + 144];
            bytes32 deposit_data_root = bytes32(data[p + 144:p + 176]);
            _deposit(pubkey, withdrawal_credentials, signature, deposit_data_root, stake_amount_per_deposit);
        }
        return true;
    }

    function _deposit(
        bytes memory pubkey,
        bytes memory withdrawal_credentials,
        bytes memory signature,
        bytes32 deposit_data_root,
        uint256 stake_amount
    ) internal {
        // Extended ABI length checks since dynamic types are used.
        require(pubkey.length == 48, "DepositContract: invalid pubkey length");
        require(withdrawal_credentials.length == 32, "DepositContract: invalid withdrawal_credentials length");
        require(signature.length == 96, "DepositContract: invalid signature length");

        // Check deposit amount
        require(stake_amount >= 1 ether, "DepositContract: deposit value too low");
        require(stake_amount % 1 gwei == 0, "DepositContract: deposit value not multiple of gwei");
        uint256 deposit_amount = stake_amount / 1 gwei;
        require(deposit_amount <= type(uint64).max, "DepositContract: deposit value too high");

        // Don't allow to use different withdrawal credentials for subsequent deposits
        bytes32 saved_wc = validator_withdrawal_credentials[pubkey];
        bytes32 wc;
        assembly {
            wc := mload(add(withdrawal_credentials, 32))
        }
        if (saved_wc == bytes32(0)) {
            validator_withdrawal_credentials[pubkey] = wc;
        } else {
            require(saved_wc == wc, "DepositContract: invalid withdrawal_credentials");
        }

        // Emit `DepositEvent` log
        bytes memory amount = to_little_endian_64(uint64(deposit_amount));
        emit DepositEvent(
            pubkey,
            withdrawal_credentials,
            amount,
            signature,
            to_little_endian_64(uint64(deposit_count))
        );

        // Compute deposit data root (`DepositData` hash tree root)
        bytes32 pubkey_root = sha256(abi.encodePacked(pubkey, bytes16(0)));
        bytes32[3] memory sig_parts = abi.decode(signature, (bytes32[3]));
        bytes32 signature_root = sha256(
            abi.encodePacked(
                sha256(abi.encodePacked(sig_parts[0], sig_parts[1])),
                sha256(abi.encodePacked(sig_parts[2], bytes32(0)))
            )
        );
        bytes32 node = sha256(
            abi.encodePacked(
                sha256(abi.encodePacked(pubkey_root, withdrawal_credentials)),
                sha256(abi.encodePacked(amount, bytes24(0), signature_root))
            )
        );

        // Verify computed and expected deposit data roots match
        require(
            node == deposit_data_root,
            "DepositContract: reconstructed DepositData does not match supplied deposit_data_root"
        );

        // Avoid overflowing the Merkle tree (and prevent edge case in computing `branch`)
        require(deposit_count < MAX_DEPOSIT_COUNT, "DepositContract: merkle tree full");

        // Add deposit data root to Merkle tree (update a single `branch` node)
        deposit_count += 1;
        uint256 size = deposit_count;
        for (uint256 height = 0; height < DEPOSIT_CONTRACT_TREE_DEPTH; height++) {
            if ((size & 1) == 1) {
                branch[height] = node;
                return;
            }
            node = sha256(abi.encodePacked(branch[height], node));
            size /= 2;
        }
        // As the loop should always end prematurely with the `return` statement,
        // this code should be unreachable. We assert `false` just to be safe.
        assert(false);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IDepositContract).interfaceId ||
            interfaceId == type(IERC677Receiver).interfaceId;
    }

    /**
     * @dev Allows to transfer any locked token from this contract.
     * Only admin can call this method.
     * Deposit-related tokens cannot be claimed.
     * @param _token address of the token, if it is not provided (0x00..00), native coins will be transferred.
     * @param _to address that will receive the locked tokens from this contract.
     */
    function claimTokens(address _token, address _to) external onlyAdmin {
        require(address(stake_token) != _token, "DepositContract: not allowed to claim deposit token");
        _claimValues(_token, _to);
    }

    function to_little_endian_64(uint64 value) internal pure returns (bytes memory ret) {
        ret = new bytes(8);
        bytes8 bytesValue = bytes8(value);
        // Byteswapping during copying to bytes.
        ret[0] = bytesValue[7];
        ret[1] = bytesValue[6];
        ret[2] = bytesValue[5];
        ret[3] = bytesValue[4];
        ret[4] = bytesValue[3];
        ret[5] = bytesValue[2];
        ret[6] = bytesValue[1];
        ret[7] = bytesValue[0];
    }

    /*** Withdrawal part ***/

    address private constant SYSTEM_WITHDRAWAL_EXECUTOR = 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE;

    uint256 private constant DEFAULT_GAS_PER_WITHDRAWAL = 300000;

    IUnwrapper private immutable stakeTokenUnwrapper;
    IERC20 private immutable GNOTokenAddress;

    bool public onWithdrawalsUnwrapToGNOByDefault;

    function setOnWithdrawalsUnwrapToGNOByDefault(bool _onWithdrawalsUnwrapToGNOByDefault) external onlyAdmin {
        onWithdrawalsUnwrapToGNOByDefault = _onWithdrawalsUnwrapToGNOByDefault;
    }

    /**
     * @dev Function to be used to process a withdrawal.
     * Actually it is an internal function, only this contract can call it.
     * This is done in order to roll back all changes in case of revert.
     * @param _amount Amount to be withdrawn.
     * @param _receiver Receiver of the withdrawal.
     * @param _unwrapToGNO Indicator of whether tokens should be converted to GNO or not.
     */
    function processWithdrawalInternal(
        uint256 _amount,
        address _receiver,
        bool _unwrapToGNO
    ) external {
        require(msg.sender == address(this), "Should be used only as an internal call");

        IERC20 tokenToSend = stake_token;
        uint256 amountToSend = _amount;

        if (_unwrapToGNO) {
            tokenToSend = GNOTokenAddress;
            amountToSend = stakeTokenUnwrapper.unwrap(address(GNOTokenAddress), _amount);
        }

        tokenToSend.safeTransfer(_receiver, amountToSend);
    }

    /**
     * @dev Internal function to be used to process a withdrawal.
     * Uses processWithdrawalInternal under the hood.
     * Call to this function will revert only if it ran out of gas.
     * @param _amount Amount to be withdrawn.
     * @param _receiver Receiver of the withdrawal.
     * @param _unwrapToGNO Indicator of whether tokens should be converted to GNO or not.
     * @return success An indicator of whether the withdrawal was successful or not.
     */
    function _processWithdrawal(
        uint256 _amount,
        address _receiver,
        bool _unwrapToGNO,
        uint256 gasLimit
    ) internal returns (bool success) {
        try this.processWithdrawalInternal{gas: gasLimit}(_amount, _receiver, _unwrapToGNO) {
            return true;
        } catch {
            return false;
        }
    }

    struct FailedWithdrawalRecord {
        uint256 amount;
        address receiver;
        bool processed;
    }
    mapping(uint256 => FailedWithdrawalRecord) public failedWithdrawals;
    uint256 public numberOfFailedWithdrawals;

    bool private failedWithdrawalProcessEntered;
    modifier failedWithdrawalProcessNonReentrant() {
        require(!failedWithdrawalProcessEntered, "Failed withdrawal processing reentrancy");
        failedWithdrawalProcessEntered = true;
        _;
        failedWithdrawalProcessEntered = false;
    }

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
    ) external failedWithdrawalProcessNonReentrant whenNotPaused {
        require(_failedWithdrawalId < numberOfFailedWithdrawals, "Failed withdrawal do not exist");

        FailedWithdrawalRecord storage failedWithdrawalRecord = failedWithdrawals[_failedWithdrawalId];
        require(!failedWithdrawalRecord.processed, "Failed withdrawal already processed");

        uint256 amountToProceed = failedWithdrawalRecord.amount;
        bool unwrapToGNO = onWithdrawalsUnwrapToGNOByDefault;
        if (_msgSender() == failedWithdrawalRecord.receiver) {
            if (_amountToProceed != 0) {
                require(_amountToProceed <= failedWithdrawalRecord.amount, "Invalid amount of tokens");
                amountToProceed = _amountToProceed;
            }
            unwrapToGNO = _unwrapToGNO;
        }

        bool success = _processWithdrawal(amountToProceed, failedWithdrawalRecord.receiver, unwrapToGNO, gasleft());
        require(success, "Withdrawal processing failed");
        if (amountToProceed == failedWithdrawalRecord.amount) {
            failedWithdrawalRecord.processed = true;
        } else {
            failedWithdrawalRecord.amount -= amountToProceed;
        }
        emit FailedWithdrawalProcessed(_failedWithdrawalId, amountToProceed, failedWithdrawalRecord.receiver);
    }

    uint256 public failedWithdrawalsPointer;

    /**
     * @dev Function to be used to process failed withdrawals.
     * Call to this function will revert only if it ran out of gas.
     * Call to this function doesn't transmit flow control to any untrusted contract and uses a constant gas limit for each withdrawal,
     * so using constant gas limit and constant max number of withdrawals for calls of this function is ok.
     * @param _maxNumberOfFailedWithdrawalsToProcess Maximum number of failed withdrawals to be processed.
     */
    function processFailedWithdrawalsFromPointer(uint256 _maxNumberOfFailedWithdrawalsToProcess)
        public
        failedWithdrawalProcessNonReentrant
    {
        for (uint256 i = 0; i < _maxNumberOfFailedWithdrawalsToProcess; ++i) {
            if (failedWithdrawalsPointer == numberOfFailedWithdrawals) {
                break;
            }

            FailedWithdrawalRecord storage failedWithdrawalRecord = failedWithdrawals[failedWithdrawalsPointer];
            if (!failedWithdrawalRecord.processed) {
                bool success = _processWithdrawal(
                    failedWithdrawalRecord.amount,
                    failedWithdrawalRecord.receiver,
                    onWithdrawalsUnwrapToGNOByDefault,
                    DEFAULT_GAS_PER_WITHDRAWAL
                );
                if (!success) {
                    break;
                }
                failedWithdrawalRecord.processed = true;
                emit FailedWithdrawalProcessed(
                    failedWithdrawalsPointer,
                    failedWithdrawalRecord.amount,
                    failedWithdrawalRecord.receiver
                );
            }

            ++failedWithdrawalsPointer;
        }
    }

    /**
     * @dev Function to be used only in the system transaction.
     * Call to this function will revert only in three cases:
     *     - the caller is not `SYSTEM_WITHDRAWAL_EXECUTOR` or `_admin()`;
     *     - the length of `_amounts` array is not equal to the length of `_addresses` array;
     *     - the call ran out of gas.
     * Call to this function doesn't transmit flow control to any untrusted contract and uses a constant gas limit for each withdrawal,
     * so using constant gas limit and constant number of withdrawals for calls of this function is ok.
     * @param _amounts Array of amounts to be withdrawn.
     * @param _addresses Array of addresses that should receive the corresponding amount of tokens.
     */
    function executeSystemWithdrawals(uint64[] calldata _amounts, address[] calldata _addresses) external {
        require(
            _msgSender() == SYSTEM_WITHDRAWAL_EXECUTOR || _msgSender() == _admin(),
            "This function should be called only by SYSTEM_WITHDRAWAL_EXECUTOR or _admin()"
        );
        assert(_amounts.length == _addresses.length);

        for (uint256 i = 0; i < _amounts.length; ++i) {
            uint256 amount = uint256(_amounts[i]) * 1 gwei;
            bool success = _processWithdrawal(
                amount,
                _addresses[i],
                onWithdrawalsUnwrapToGNOByDefault,
                DEFAULT_GAS_PER_WITHDRAWAL
            );

            if (success) {
                emit WithdrawalExecuted(amount, _addresses[i]);
            } else {
                failedWithdrawals[numberOfFailedWithdrawals] = FailedWithdrawalRecord({
                    amount: amount,
                    receiver: _addresses[i],
                    processed: false
                });
                emit WithdrawalFailed(numberOfFailedWithdrawals, amount, _addresses[i]);
                ++numberOfFailedWithdrawals;
            }
        }
    }
}
