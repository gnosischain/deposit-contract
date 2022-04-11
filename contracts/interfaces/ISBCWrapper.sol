// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./IDepositContract.sol";
import "./IMintableBurnableERC677.sol";

interface ISBCWrapper {
    function sbcToken() external view returns (IMintableBurnableERC677);

    function sbcDepositContract() external view returns (IDepositContract);

    function mint(address receiver, uint256 amount) external;

    function unwrapTokens(
        address targetToken,
        address receiver,
        uint256 amount
    ) external;
}
