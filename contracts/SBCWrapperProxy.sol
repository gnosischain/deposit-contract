// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import {EIP1967Proxy} from "./utils/EIP1967Proxy.sol";
import {SBCWrapper} from "./SBCWrapper.sol";
import {SBCToken} from "./SBCToken.sol";
import {SBCDepositContract} from "./SBCDepositContract.sol";

/**
 * @title SBCWrapperProxy
 * @dev Upgradeable version of the underlying SBCWrapper.
 */
contract SBCWrapperProxy is EIP1967Proxy {
    constructor(address _admin, SBCToken _token, SBCDepositContract _depositContract) {
        _setAdmin(_admin);
        _setImplementation(address(new SBCWrapper(_token, _depositContract)));
    }
}
