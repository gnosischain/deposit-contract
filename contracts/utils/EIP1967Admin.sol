// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.6.11;

/**
 * @title EIP1967Proxy
 * @dev Upgradeable proxy pattern implementation according to minimalistic EIP1967.
 */
contract EIP1967Admin {
    modifier onlyAdmin {
        require(msg.sender == _admin());
        _;
    }

    function _admin() internal view returns (address res) {
        assembly {
            // EIP 1967
            // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
            res := sload(0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103)
        }
    }
}
