// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./interfaces/IDepositContract.sol";
import "./interfaces/IERC677Receiver.sol";
import "./utils/PausableEIP1967Admin.sol";
import "./utils/Claimable.sol";

/**
 * @title SBCDepositContract
 * @dev Implementation of the ERC20 ETH2.0 deposit contract.
 * For the original implementation, see the Phase 0 specification under https://github.com/ethereum/eth2.0-specs
 */
contract SBCDepositContract is IDepositContract, IERC165, IERC677Receiver, PausableEIP1967Admin, Claimable {
    uint256 private constant DEPOSIT_CONTRACT_TREE_DEPTH = 32;
    // NOTE: this also ensures `deposit_count` will fit into 64-bits
    uint256 private constant MAX_DEPOSIT_COUNT = 2**DEPOSIT_CONTRACT_TREE_DEPTH - 1;

    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private zero_hashes;

    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private branch;
    uint256 private deposit_count;

    IERC20 public immutable deposit_token;

    constructor(address _token) {
        deposit_token = IERC20(_token);
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
        uint256 deposit_amount
    ) external override whenNotPaused {
        deposit_token.transferFrom(msg.sender, address(this), deposit_amount);
        _deposit(pubkey, withdrawal_credentials, signature, deposit_data_root, deposit_amount);
    }

    function batchDeposit(
        bytes calldata pubkeys,
        bytes calldata withdrawal_credentials,
        bytes calldata signatures,
        bytes32[] calldata deposit_data_roots
    ) external whenNotPaused {
        uint256 count = deposit_data_roots.length;
        require(count > 0, "SBCDepositContract: You should deposit at least one validator");
        require(count <= 128, "SBCDepositContract: You can deposit max 128 validators at a time");

        require(pubkeys.length == count * 48, "SBCDepositContract: Pubkey count don't match");
        require(signatures.length == count * 96, "SBCDepositContract: Signatures count don't match");
        require(withdrawal_credentials.length == 32, "SBCDepositContract: Withdrawal Credentials count don't match");

        uint256 deposit_amount = 32 ether;
        deposit_token.transferFrom(msg.sender, address(this), deposit_amount * count);

        for (uint256 i = 0; i < count; ++i) {
            bytes memory pubkey = bytes(pubkeys[i * 48:(i + 1) * 48]);
            bytes memory signature = bytes(signatures[i * 96:(i + 1) * 96]);

            _deposit(pubkey, withdrawal_credentials, signature, deposit_data_roots[i], deposit_amount);
        }
    }

    function onTokenTransfer(
        address,
        uint256 amount,
        bytes calldata data
    ) external override whenNotPaused returns (bool) {
        require(msg.sender == address(deposit_token), "SBCDepositContract: not a deposit token");
        require(data.length % 176 == 32, "SBCDepositContract: incorrect deposit data length");
        uint256 count = data.length / 176;
        require(count > 0, "SBCDepositContract: You should deposit at least one validator");
        uint256 deposit_amount = amount;
        if (count > 1) {
            require(count <= 128, "SBCDepositContract: You can deposit max 128 validators at a time");
            require(amount == 32 ether * count, "SBCDepositContract: batch deposits require 32 SBC deposit amount");
            deposit_amount = 32 ether;
        }

        bytes memory withdrawal_credentials = data[0:32];
        for (uint256 p = 32; p < data.length; p += 176) {
            bytes memory pubkey = data[p:p + 48];
            bytes memory signature = data[p + 48:p + 144];
            bytes32 deposit_data_root = bytes32(data[p + 144:p + 176]);
            _deposit(pubkey, withdrawal_credentials, signature, deposit_data_root, deposit_amount);
        }
        return true;
    }

    function _deposit(
        bytes memory pubkey,
        bytes memory withdrawal_credentials,
        bytes memory signature,
        bytes32 deposit_data_root,
        uint256 deposit_amount
    ) internal {
        // Extended ABI length checks since dynamic types are used.
        require(pubkey.length == 48, "SBCDepositContract: invalid pubkey length");
        require(withdrawal_credentials.length == 32, "SBCDepositContract: invalid withdrawal_credentials length");
        require(signature.length == 96, "SBCDepositContract: invalid signature length");

        // Check deposit amount
        require(deposit_amount >= 1 ether, "SBCDepositContract: deposit value too low");
        require(deposit_amount % 1 gwei == 0, "SBCDepositContract: deposit value not multiple of gwei");
        uint256 deposit_amount = deposit_amount / 1 gwei;
        require(deposit_amount <= type(uint64).max, "SBCDepositContract: deposit value too high");

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
            "SBCDepositContract: reconstructed DepositData does not match supplied deposit_data_root"
        );

        // Avoid overflowing the Merkle tree (and prevent edge case in computing `branch`)
        require(deposit_count < MAX_DEPOSIT_COUNT, "SBCDepositContract: merkle tree full");

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
        require(address(deposit_token) != _token, "SBCDepositContract: not allowed to claim deposit token");
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
}