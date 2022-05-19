// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./SBCToken.sol";
import "./SBCWrapper.sol";
import "./BlockReward.sol";
import "./SBCDepositContract.sol";

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

    function surplus() external view returns (int256) {
        uint256 lockedGNO = depositToken.balanceOf(address(wrapper));
        uint256 circulationMGNO = metaToken.totalSupply() - metaToken.balanceOf(address(depositContract));
        uint256 totalMGNOWithdrawals = blockReward.totalWithdrawalsAmount();
        uint256 completedMGNOWithdrawals = depositContract.totalWithdrawalsAmount();
        uint256 rate = wrapper.tokenRate(address(depositToken));
        uint256 backedMGNO = (lockedGNO * rate) / 1 ether;
        return int256(backedMGNO) - int256(circulationMGNO + totalMGNOWithdrawals - completedMGNOWithdrawals);
    }
}
