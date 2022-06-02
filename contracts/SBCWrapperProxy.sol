// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./utils/EIP1967Proxy.sol";
import "./SBCWrapper.sol";

/**
 * @title SBCWrapperProxy
 * @dev Upgradeable version of the underlying SBCWrapper.
 */
contract SBCWrapperProxy is EIP1967Proxy {
    constructor(
        address _admin,
        IMintableBurnableERC677 _token,
        IDepositContract _depositContract
    ) {
        _setAdmin(_admin);
        _setImplementation(address(new SBCWrapper(_token, _depositContract)));
    }
}
