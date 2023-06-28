// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import {EIP1967Proxy} from "./utils/EIP1967Proxy.sol";
import {SBCToken} from "./SBCToken.sol";

/**
 * @title SBCTokenProxy
 * @dev Upgradeable version of the underlying SBCToken.
 */
contract SBCTokenProxy is EIP1967Proxy {
    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    constructor(address _admin, string memory name, string memory symbol) {
        _setAdmin(_admin);
        _setImplementation(address(new SBCToken()));
        _name = name;
        _symbol = symbol;
    }
}
