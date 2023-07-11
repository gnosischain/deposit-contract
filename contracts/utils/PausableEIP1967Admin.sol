// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {EIP1967Admin} from "./EIP1967Admin.sol";

/**
 * @title PausableEIP1967Admin
 * @dev Pausable contract, controlled by the current EIP1967 proxy owner.
 */
contract PausableEIP1967Admin is EIP1967Admin, Pausable {
    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }
}
