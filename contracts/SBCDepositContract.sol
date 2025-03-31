// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IDepositContract} from "./interfaces/IDepositContract.sol";
import {IERC677Receiver} from "./interfaces/IERC677Receiver.sol";
import {IUnwrapper} from "./interfaces/IUnwrapper.sol";
import {IWithdrawalContract} from "./interfaces/IWithdrawalContract.sol";
import {PausableEIP1967Admin} from "./utils/PausableEIP1967Admin.sol";
import {Claimable} from "./utils/Claimable.sol";

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
    uint256 private constant MAX_DEPOSIT_COUNT = 2 ** DEPOSIT_CONTRACT_TREE_DEPTH - 1;

    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private zero_hashes;

    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private branch;
    uint256 private deposit_count;

    mapping(bytes => bytes32) public validator_withdrawal_credentials;

    IERC20 public immutable stake_token;

    address private constant SYSTEM_WITHDRAWAL_EXECUTOR = 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE;
    mapping(address => uint256) public withdrawableAmount;

    constructor(address _token) {
        stake_token = IERC20(_token);
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

        uint256 stake_amount = 1 ether;
        stake_token.transferFrom(msg.sender, address(this), stake_amount * count);

        for (uint256 i = 0; i < count; ++i) {
            bytes memory pubkey = bytes(pubkeys[i * 48:(i + 1) * 48]);
            bytes memory signature = bytes(signatures[i * 96:(i + 1) * 96]);

            _deposit(pubkey, withdrawal_credentials, signature, deposit_data_roots[i], stake_amount);
        }
    }

    function batchDepositVariableAmount(
        bytes calldata pubkeys,
        bytes calldata withdrawal_credentials,
        bytes calldata signatures,
        bytes32[] calldata deposit_data_roots,
        uint256[] calldata amounts
    ) external whenNotPaused {
        uint256 count = deposit_data_roots.length;
        require(count > 0, "BatchDeposit: You should deposit at least one validator");
        require(count <= 128, "BatchDeposit: You can deposit max 128 validators at a time");

        require(pubkeys.length == count * 48, "BatchDeposit: Pubkey count doesn't match");
        require(signatures.length == count * 96, "BatchDeposit: Signatures count doesn't match");
        require(withdrawal_credentials.length == 32, "BatchDeposit: Withdrawal Credentials count doesn't match");

        require(amounts.length == count, "BatchDeposit: Amounts count doesn't match");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < count; ++i) {
            totalAmount += amounts[i];
        }

        stake_token.transferFrom(msg.sender, address(this), totalAmount);

        for (uint256 i = 0; i < count; ++i) {
            bytes memory pubkey = bytes(pubkeys[i * 48:(i + 1) * 48]);
            bytes memory signature = bytes(signatures[i * 96:(i + 1) * 96]);

            _deposit(pubkey, withdrawal_credentials, signature, deposit_data_roots[i], amounts[i]);
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
            require(stake_amount == 1 ether * count, "BatchDeposit: batch deposits require 1 GNO deposit amount");
            stake_amount_per_deposit = 1 ether;
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
        // Multiply stake amount by 32 (1 GNO for validating instead of the 32 ETH expected)
        stake_amount = 32 * stake_amount;

        // Extended ABI length checks since dynamic types are used.
        require(pubkey.length == 48, "DepositContract: invalid pubkey length");
        require(withdrawal_credentials.length == 32, "DepositContract: invalid withdrawal_credentials length");
        require(signature.length == 96, "DepositContract: invalid signature length");

        // Check deposit amount
        require(stake_amount >= 1 ether, "DepositContract: deposit value too low");
        require(stake_amount % 1 gwei == 0, "DepositContract: deposit value not multiple of gwei");
        uint256 deposit_amount = stake_amount / 1 gwei;
        require(deposit_amount <= type(uint64).max, "DepositContract: deposit value too high");

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

    /**
     * @dev Claim withdrawal amount for an address
     * @param _address Address to transfer withdrawable tokens
     */
    function claimWithdrawal(address _address) public {
        uint256 amount = withdrawableAmount[_address];
        if (amount > 0) {
            withdrawableAmount[_address] = 0;
            stake_token.safeTransfer(_address, amount);
        }
    }

    /**
     * @dev Claim withdrawal amounts for an array of addresses
     * @param _addresses Addresses to transfer withdrawable tokens
     */
    function claimWithdrawals(address[] calldata _addresses) external {
        for (uint256 i = 0; i < _addresses.length; ++i) {
            claimWithdrawal(_addresses[i]);
        }
    }

    /**
     * @dev Function to be used only in the system transaction.
     * Call to this function will revert only in case:
     *     - the caller is not `SYSTEM_WITHDRAWAL_EXECUTOR` or `_admin()`;
     *     - the length of `_amounts` array is not equal to the length of `_addresses` array;
     * Call to this function doesn't transmit flow control to any untrusted contract, nor does any operation of unbounded gas usage.
     * NOTE: This function signature is hardcoded in the Gnosis execution layer clients. Changing this signature without updating the
     * clients will cause block verification of any post-shangai block to fail. The function signature cannonical spec is here
     * https://github.com/gnosischain/specs/blob/master/execution/withdrawals.md
     * Note: chiado network requires this signature to sync post-shapella blocks. This function signature can only be deprecated after
     * deprecating chiado network of full sync up to a pre-specified block.
     * @custom:deprecatedparam _deprecatedUnused Previously `maxFailedWithdrawalsToProcess` currently deprecated and ignored
     * @param _amounts Array of amounts to be withdrawn.
     * @param _addresses Array of addresses that should receive the corresponding amount of tokens.
     */
    function executeSystemWithdrawals(
        uint256 /* _deprecatedUnused */,
        uint64[] calldata _amounts,
        address[] calldata _addresses
    ) public {
        require(
            _msgSender() == SYSTEM_WITHDRAWAL_EXECUTOR || _msgSender() == _admin(),
            "This function should be called only by SYSTEM_WITHDRAWAL_EXECUTOR or _admin()"
        );
        assert(_amounts.length == _addresses.length);

        for (uint256 i = 0; i < _amounts.length; ++i) {
            // Divide stake amount by 32 (1 GNO for validating instead of the 32 ETH expected)
            uint256 amount = (uint256(_amounts[i]) * 1 gwei) / 32;
            withdrawableAmount[_addresses[i]] += amount;
        }
    }

    /**
     * @dev Forwards compatible signature for `executeSystemWithdrawals` to support its future deprecation
     * Clients must support and use the signature specified in the spec at:
     * https://github.com/gnosischain/specs/blob/master/execution/withdrawals.md
     */
    function executeSystemWithdrawals(uint64[] calldata _amounts, address[] calldata _addresses) external {
        executeSystemWithdrawals(0, _amounts, _addresses);
    }

    /**
     * @dev Allows to unwrap the mGNO in this contract to GNO
     * Only admin can call this method.
     * @param _unwrapper address of the mGNO token unwrapper
     */
    function unwrapTokens(IUnwrapper _unwrapper, IERC20 _token) external onlyAdmin {
        _unwrapper.unwrap(address(stake_token), _token.balanceOf(address(this)));
    }
}
