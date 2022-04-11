// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

interface IBlockReward {
    struct Withdrawal {
        address receiver;
        uint256 amount;
    }

    function addExtraReceiver(uint256 _amount, address _receiver) external;

    function reward(address[] calldata benefactors, uint16[] calldata kind)
        external
        returns (address[] memory receiversNative, uint256[] memory rewardsNative);

    function addBeaconWithdrawals(
        uint256[] calldata indices,
        address[] calldata receivers,
        uint256[] calldata amounts
    ) external;

    function mintedTotally() external view returns (uint256);

    function mintedTotallyByBridge(address) external view returns (uint256);

    function withdrawal(uint256 index) external view returns (Withdrawal memory);

    function nextWithdrawalIndex() external view returns (uint256);

    function blockRewardContractId() external pure returns (bytes4);
}
