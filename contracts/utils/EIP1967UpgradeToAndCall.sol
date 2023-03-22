// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "./EIP1967Proxy.sol";

/**
 * @title UpgradeToAndCall
 * @dev Upgrade EIP1967Proxy and call a function
 */
contract EIP1967UpgradeToAndCall {
    address private target;

    constructor(address _target) {
        target = _target;
    }

    function upgradeToAndCall(address newImplementation, bytes memory data) public payable returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(
            abi.encodeWithSignature("upgradeTo(address)", newImplementation)
        );
        Address.verifyCallResult(success, returndata, "EIP1967UpgradeToAndCall: upgradeTo delegatecall failed");

        (success, returndata) = target.delegatecall(data);
        return Address.verifyCallResult(success, returndata, "EIP1967UpgradeToAndCall: delegatecall failed");
    }
}
