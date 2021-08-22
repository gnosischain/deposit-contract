// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.7;

import "./IERC20.sol";

interface IERC667 is IERC20 {
    function transferAndCall(
        address to,
        uint256 amount,
        bytes calldata data
    ) external;
}
