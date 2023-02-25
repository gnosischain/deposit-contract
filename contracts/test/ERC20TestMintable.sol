// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "../utils/Claimable.sol";
import "../utils/PausableEIP1967Admin.sol";
import "../interfaces/IERC677.sol";
import "../interfaces/IERC677Receiver.sol";

/**
 * @title Test ERC20 with mintable permissions to admin
 */
contract ERC20TestMintable is IERC677, ERC20Pausable, PausableEIP1967Admin, Claimable {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /**
     * @dev UNSAFE anyone can mint
     */
    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    /**
     * @dev Implements the ERC677 transferAndCall standard.
     * Executes a regular transfer, but calls the receiver's function to handle them in the same transaction.
     * @param _to tokens receiver.
     * @param _amount amount of sent tokens.
     * @param _data extra data to pass to the callback function.
     */
    function transferAndCall(
        address _to,
        uint256 _amount,
        bytes calldata _data
    ) external override {
        address sender = _msgSender();
        _transfer(sender, _to, _amount);
        require(IERC677Receiver(_to).onTokenTransfer(sender, _amount, _data), "SBCToken: ERC677 callback failed");
    }
}
