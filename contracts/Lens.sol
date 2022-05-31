// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./SBCToken.sol";
import "./SBCWrapper.sol";
import "./BlockReward.sol";
import "./SBCDepositContract.sol";

/**
 * @title Lens
 * @dev Read-only methods for getting GBC deposits/withdrawals insights.
 */
contract Lens {
    IERC677 private depositToken;
    SBCToken private metaToken;
    SBCWrapper private wrapper;
    SBCDepositContract private depositContract;
    BlockReward private blockReward;

    constructor(
        IERC677 _depositToken,
        SBCToken _metaToken,
        SBCWrapper _wrapper,
        SBCDepositContract _depositContract,
        BlockReward _blockReward
    ) {
        depositToken = _depositToken;
        metaToken = _metaToken;
        wrapper = _wrapper;
        depositContract = _depositContract;
        blockReward = _blockReward;
    }

    /**
     * @dev Checks if the amount of locked GNO in GBC is enough to cover circulating mGNO and pending withdrawals.
     * There are 2 main sources for unlocked GNO staked in GBC:
     * - unwrap freely available mGNO (any mGNO not in the deposit contract)
     * - completing pending withdrawals from the GBC (which will add more mGNO to circulation)
     * We consider situation as healthy, if all mGNO holders and pending withdrawal receivers can unwrap their GNO without any problems at the same time.
     * In this case the surplus will be >= 0.
     * If surplus is negative, then the contract should be "refilled". This can be done by either of those methods:
     * - direct GNO transfer to the wrapper contract (locked GNO increases, but circulating mGNO remains unchanged)
     * - mGNO deposit to the GBC (locked GNO remains unchanged, but the circulating mGNO decreases).
     * - GNO wrap and immediate deposit to GBC (locked GNO increases, circulating mGNO remains unchanged)
     * @return amount of GNO surplus (usually should be positive).
     */
    function surplus() external view returns (int256) {
        uint256 lockedGNO = depositToken.balanceOf(address(wrapper));
        uint256 circulationMGNO = metaToken.totalSupply() - metaToken.balanceOf(address(depositContract));
        return int256(lockedGNO) - int256(_denominateToGNO(circulationMGNO) + pendingWithdrawals());
    }

    /**
     * @dev Returns the total amount over all requested GNO withdrawals from the GBC.
     * @return total amount of GNO withdrawals requested from the GBC.
     */
    function totalWithdrawals() external view returns (uint256) {
        return _denominateToGNO(blockReward.totalWithdrawalsAmount());
    }

    /**
     * @dev Returns the total amount over all pending GNO withdrawals from the GBC, which were not exercised by users yet.
     * @return total amount of pending GNO withdrawals requested from the GBC.
     */
    function pendingWithdrawals() public view returns (uint256) {
        uint256 totalMGNOWithdrawals = blockReward.totalWithdrawalsAmount();
        uint256 completedMGNOWithdrawals = depositContract.totalWithdrawalsAmount();
        return _denominateToGNO(totalMGNOWithdrawals - completedMGNOWithdrawals);
    }

    function _denominateToGNO(uint256 _amount) internal view returns (uint256) {
        uint256 rate = wrapper.tokenRate(address(depositToken));
        return (_amount * 1 ether) / rate;
    }
}
