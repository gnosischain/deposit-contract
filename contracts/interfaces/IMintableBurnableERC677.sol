// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./IERC677.sol";

interface IMintableBurnableERC677 is IERC677 {
    function mint(address to, uint256 amount) external;

    function burn(uint256 amount) external;
}
