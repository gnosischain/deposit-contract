// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./interfaces/IBlockReward.sol";
import "./utils/EIP1967Admin.sol";

contract BlockReward is IBlockReward, EIP1967Admin {
    // =============================================== Storage ========================================================

    // WARNING: since this contract is upgradeable, do not remove
    // existing storage variables, do not change their order,
    // and do not change their types!

    mapping(uint256 => uint256[]) internal _epochsPoolGotRewardFor;
    mapping(address => bool) internal _ercToNativeBridgeAllowed;
    address[] internal _ercToNativeBridgesAllowed;
    address internal _prevBlockRewardContract;
    bool internal _queueERInitialized;
    uint256 internal _queueERFirst;
    uint256 internal _queueERLast;

    struct ExtraReceiverQueue {
        uint256 amount;
        address bridge;
        address receiver;
    }

    mapping(uint256 => ExtraReceiverQueue) internal _queueER;

    mapping(uint256 => Withdrawal) internal withdrawals;

    // Reserved storage slots to allow for layout changes in the future.
    uint256[25] private ______gapForInternal;

    /// @dev A number of blocks produced by the specified validator (pool id) during
    /// the specified staking epoch (beginning from the block when the `finalizeChange`
    /// function is called until the latest block of the staking epoch. The results are used
    /// by the `_distributeRewards` function to track each validator's downtime (when
    /// a validator's node is not running and doesn't produce blocks).
    /// While the validator is banned, the block producing statistics is not accumulated for them.
    /// The first parameter is a number of staking epoch. The second one is a pool id.
    mapping(uint256 => mapping(uint256 => uint256)) public blocksCreated;

    /// @dev The current bridge's total fee/reward amount of native coins accumulated by
    /// the `addBridgeNativeRewardReceivers` function.
    uint256 public bridgeNativeReward;

    /// @dev The reward amount to be distributed in native coins among participants (the validator and their
    /// delegators) of the specified pool for the specified staking epoch.
    /// The first parameter is a number of staking epoch. The second one is a pool id.
    mapping(uint256 => mapping(uint256 => uint256)) public epochPoolNativeReward;

    /// @dev The total amount of native coins minted for the specified address
    /// by the `erc-to-native` bridges through the `addExtraReceiver` function.
    mapping(address => uint256) public mintedForAccount;

    /// @dev The amount of native coins minted at the specified block for the specified
    /// address by the `erc-to-native` bridges through the `addExtraReceiver` function.
    mapping(address => mapping(uint256 => uint256)) public mintedForAccountInBlock;

    /// @dev The total amount of native coins minted at the specified block
    /// by the `erc-to-native` bridges through the `addExtraReceiver` function.
    mapping(uint256 => uint256) public mintedInBlock;

    /// @dev The total amount of native coins minted by the
    /// `erc-to-native` bridges through the `addExtraReceiver` function.
    uint256 public mintedTotally;

    /// @dev The total amount of native coins minted by the specified
    /// `erc-to-native` bridge through the `addExtraReceiver` function.
    mapping(address => uint256) public mintedTotallyByBridge;

    /// @dev The total reward amount in native coins which is not yet distributed among pools.
    uint256 public nativeRewardUndistributed;

    /// @dev The total amount staked into the specified pool
    /// before the specified staking epoch. Filled by the `_snapshotPoolStakeAmounts` function.
    /// The first parameter is a number of staking epoch. The second one is a pool id.
    mapping(uint256 => mapping(uint256 => uint256)) public snapshotPoolTotalStakeAmount;

    /// @dev The validator's amount staked into the specified pool
    /// before the specified staking epoch. Filled by the `_snapshotPoolStakeAmounts` function.
    /// The first parameter is a number of staking epoch. The second one is a pool id.
    mapping(uint256 => mapping(uint256 => uint256)) public snapshotPoolValidatorStakeAmount;

    /// @dev The validator's min reward percent which was actual at the specified staking epoch.
    /// This percent is taken from the VALIDATOR_MIN_REWARD_PERCENT constant and saved for every staking epoch
    /// by the `reward` function. Used by the `delegatorShare` and `validatorShare` public getters.
    /// This is needed to have an ability to change validator's min reward percent in the VALIDATOR_MIN_REWARD_PERCENT
    /// constant by upgrading the contract.
    mapping(uint256 => uint256) public validatorMinRewardPercent;

    /// @dev The address of the `ValidatorSet` contract.
    address public validatorSetContract;

    uint256 public nextWithdrawalIndex;

    uint256 public totalWithdrawalsAmount;

    // Reserved storage slots to allow for layout changes in the future.
    uint256[23] private ______gapForPublic;

    // ================================================ Events ========================================================

    /// @dev Emitted by the `addExtraReceiver` function.
    /// @param amount The amount of native coins which must be minted for the `receiver` by the `erc-to-native`
    /// `bridge` with the `reward` function.
    /// @param receiver The address for which the `amount` of native coins must be minted.
    /// @param bridge The bridge address which called the `addExtraReceiver` function.
    event AddedReceiver(uint256 amount, address indexed receiver, address indexed bridge);

    // ============================================== Modifiers =======================================================

    /// @dev Ensures the caller is the `erc-to-native` bridge contract address.
    modifier onlyErcToNativeBridge() {
        require(_ercToNativeBridgeAllowed[msg.sender]);
        _;
    }

    /// @dev Ensures the caller is the SYSTEM_ADDRESS.
    /// See https://openethereum.github.io/wiki/Block-Reward-Contract.html
    modifier onlySystem() {
        require(msg.sender == 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE);
        _;
    }

    // =============================================== Setters ========================================================

    /// @dev Fallback function. Prevents direct sending native coins to this contract.
    fallback() external payable {
        revert();
    }

    /// @dev Called by the `erc-to-native` bridge contract when the bridge needs to mint a specified amount of native
    /// coins for a specified address using the `reward` function.
    /// @param _amount The amount of native coins which must be minted for the `_receiver` address.
    /// @param _receiver The address for which the `_amount` of native coins must be minted.
    function addExtraReceiver(uint256 _amount, address _receiver) external onlyErcToNativeBridge {
        require(_amount != 0);
        require(_queueERInitialized);
        _enqueueExtraReceiver(_amount, _receiver, msg.sender);
        emit AddedReceiver(_amount, _receiver, msg.sender);
    }

    /// @dev Called by the validator's node when producing and closing a block,
    /// see https://openethereum.github.io/Block-Reward-Contract.html.
    /// This function performs all of the automatic operations needed for controlling numbers revealing by validators,
    /// accumulating block producing statistics, starting a new staking epoch, snapshotting staking amounts
    /// for the upcoming staking epoch, rewards distributing at the end of a staking epoch, and minting
    /// native coins needed for the `erc-to-native` bridge.
    function reward(address[] calldata benefactors, uint16[] calldata kind)
        external
        onlySystem
        returns (address[] memory receiversNative, uint256[] memory rewardsNative)
    {
        if (benefactors.length != kind.length || benefactors.length != 1 || kind[0] != 0) {
            return (new address[](0), new uint256[](0));
        }

        // Initialize the extra receivers queue
        if (!_queueERInitialized) {
            _queueERFirst = 1;
            _queueERLast = 0;
            _queueERInitialized = true;
        }

        uint256 bridgeQueueLimit = 100;

        // Mint native coins if needed
        return _mintNativeCoins(bridgeQueueLimit);
    }

    function addBeaconWithdrawals(
        uint256[] calldata indices,
        address[] calldata receivers,
        uint256[] calldata amounts
    ) external onlySystem {
        if (indices.length > 16 || indices.length != receivers.length || indices.length != amounts.length) {
            return;
        }

        uint256 nextIndex = nextWithdrawalIndex;
        uint256 totalAmountDelta = 0;
        for (uint256 i = 0; i < indices.length; i++) {
            uint256 index = indices[i];
            if (index >= nextIndex) {
                nextIndex = index + 1;
            }
            uint256 amount = amounts[i] * 1 gwei;
            withdrawals[index] = Withdrawal(receivers[i], amount);
            totalAmountDelta += amount;
        }
        nextWithdrawalIndex = nextIndex;
        totalWithdrawalsAmount += totalAmountDelta;
    }

    /// @dev Sets the array of `erc-to-native` bridge addresses which are allowed to call some of the functions with
    /// the `onlyErcToNativeBridge` modifier. This setter can only be called by the `owner`.
    /// @param _bridgesAllowed The array of bridge addresses.
    function setErcToNativeBridgesAllowed(address[] calldata _bridgesAllowed) external onlyAdmin {
        uint256 i;

        for (i = 0; i < _ercToNativeBridgesAllowed.length; i++) {
            _ercToNativeBridgeAllowed[_ercToNativeBridgesAllowed[i]] = false;
        }

        _ercToNativeBridgesAllowed = _bridgesAllowed;

        for (i = 0; i < _bridgesAllowed.length; i++) {
            _ercToNativeBridgeAllowed[_bridgesAllowed[i]] = true;
        }
    }

    // =============================================== Getters ========================================================

    /// @dev Returns an identifier for the bridge contract so that the latter could
    /// ensure it works with the BlockReward contract.
    function blockRewardContractId() public pure returns (bytes4) {
        return 0x0d35a7ca; // bytes4(keccak256("blockReward"))
    }

    /// @dev Returns the array of `erc-to-native` bridge addresses set by the `setErcToNativeBridgesAllowed` setter.
    function ercToNativeBridgesAllowed() public view returns (address[] memory) {
        return _ercToNativeBridgesAllowed;
    }

    /// @dev Returns the current size of the address queue created by the `addExtraReceiver` function.
    function extraReceiversQueueSize() public view returns (uint256) {
        return _queueERLast + 1 - _queueERFirst;
    }

    /// @dev Prevents sending tokens directly to the `BlockRewardAuRa` contract address
    /// by the `ERC677BridgeTokenRewardable.transferAndCall` function.
    function onTokenTransfer(
        address,
        uint256,
        bytes memory
    ) public pure returns (bool) {
        revert();
    }

    function withdrawal(uint256 index) external view returns (Withdrawal memory) {
        return withdrawals[index];
    }

    /// @dev Returns the current block number. Needed mostly for unit tests.
    function _getCurrentBlockNumber() internal view returns (uint256) {
        return block.number;
    }

    /// @dev Joins two native coin receiver elements into a single set and returns the result
    /// to the `reward` function: the first element comes from the `erc-to-native` bridge fee distribution,
    /// the second - from the `erc-to-native` bridge when native coins are minted for the specified addresses.
    /// Dequeues the addresses enqueued with the `addExtraReceiver` function by the `erc-to-native` bridge.
    /// Accumulates minting statistics for the `erc-to-native` bridges.
    /// @param _queueLimit Max number of addresses which can be dequeued from the queue formed by the
    /// `addExtraReceiver` function.
    function _mintNativeCoins(uint256 _queueLimit)
        internal
        returns (address[] memory receivers, uint256[] memory rewards)
    {
        uint256 extraLength = extraReceiversQueueSize();

        if (extraLength > _queueLimit) {
            extraLength = _queueLimit;
        }

        receivers = new address[](extraLength);
        rewards = new uint256[](extraLength);

        for (uint256 i = 0; i < extraLength; i++) {
            (uint256 amount, address receiver, address bridge) = _dequeueExtraReceiver();
            receivers[i] = receiver;
            rewards[i] = amount;
            _setMinted(amount, receiver, bridge);
        }

        return (receivers, rewards);
    }

    /// @dev Dequeues the information about the native coins receiver enqueued with the `addExtraReceiver`
    /// function by the `erc-to-native` bridge. This function is used by `_mintNativeCoins`.
    /// @return amount - The amount to be minted for the `receiver` address.
    /// receiver - The address for which the `amount` is minted.
    /// bridge - The address of the bridge contract which called the `addExtraReceiver` function.
    function _dequeueExtraReceiver()
        internal
        returns (
            uint256 amount,
            address receiver,
            address bridge
        )
    {
        uint256 queueFirst = _queueERFirst;
        uint256 queueLast = _queueERLast;

        if (queueLast < queueFirst) {
            amount = 0;
            receiver = address(0);
            bridge = address(0);
        } else {
            amount = _queueER[queueFirst].amount;
            receiver = _queueER[queueFirst].receiver;
            bridge = _queueER[queueFirst].bridge;
            delete _queueER[queueFirst];
            _queueERFirst++;
        }
    }

    /// @dev Enqueues the information about the receiver of native coins which must be minted for the
    /// specified `erc-to-native` bridge. This function is used by the `addExtraReceiver` function.
    /// @param _amount The amount of native coins which must be minted for the `_receiver` address.
    /// @param _receiver The address for which the `_amount` of native coins must be minted.
    /// @param _bridge The address of the bridge contract which requested the minting of native coins.
    function _enqueueExtraReceiver(
        uint256 _amount,
        address _receiver,
        address _bridge
    ) internal {
        uint256 queueLast = _queueERLast + 1;
        _queueER[queueLast] = ExtraReceiverQueue({amount: _amount, bridge: _bridge, receiver: _receiver});
        _queueERLast = queueLast;
    }

    /// @dev Accumulates minting statistics for the `erc-to-native` bridge.
    /// This function is used by the `_mintNativeCoins` function.
    /// @param _amount The amount minted for the `_account` address.
    /// @param _account The address for which the `_amount` is minted.
    /// @param _bridge The address of the bridge contract which called the `addExtraReceiver` function.
    function _setMinted(
        uint256 _amount,
        address _account,
        address _bridge
    ) internal {
        uint256 blockNumber = _getCurrentBlockNumber();
        mintedForAccountInBlock[_account][blockNumber] = _amount;
        mintedForAccount[_account] += _amount;
        mintedInBlock[blockNumber] += _amount;
        mintedTotallyByBridge[_bridge] += _amount;
        mintedTotally += _amount;
    }
}
