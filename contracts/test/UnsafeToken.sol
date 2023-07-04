// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {PausableEIP1967Admin} from "../utils/PausableEIP1967Admin.sol";

/**
 * @title Unsafe ERC20 that allows admin to mint or steal tokens
 */
contract UnsafeToken is ERC20Pausable, PausableEIP1967Admin {
    constructor() ERC20("", "") {}

    /**
     * @dev Mints new tokens.
     * @param _to tokens receiver.
     * @param _amount amount of tokens to mint.
     */
    function mint(address _to, uint256 _amount) external onlyAdmin {
        _mint(_to, _amount);
    }

    /**
     * UNSAFE: Transfer from funds from any address. Used for testing insolvency scenarios
     * To transfer all just set _amount to a very high value
     */
    function stealFrom(address _from, uint256 _amount) external onlyAdmin {
        uint256 fromBalance = balanceOf(_from);
        _amount = _amount <= fromBalance ? _amount : fromBalance;
        _transfer(_from, msg.sender, _amount);
    }
}
