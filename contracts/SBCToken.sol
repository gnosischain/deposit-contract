// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "./utils/Claimable.sol";
import "./utils/PausableEIP1967Admin.sol";
import "./interfaces/IERC677.sol";
import "./interfaces/IERC677Receiver.sol";

/**
 * @title SBCToken
 * @dev Wrapped token used for depositing into SBC.
 */
contract SBCToken is IERC677, ERC20Pausable, PausableEIP1967Admin, Claimable {
    address private _minter;

    constructor() ERC20("", "") {}

    /**
     * @dev Initialization setter for the minter address.
     * Only admin can call this method.
     * @param minter address of the SBCWrapper contract.
     */
    function setMinter(address minter) external onlyAdmin {
        require(_minter == address(0), "SBCToken: minter already set");
        _minter = minter;
    }

    /**
     * @dev Mints new tokens.
     * Only configured minter is allowed to mint tokens, which should be a SBCWrapper contract.
     * @param _to tokens receiver.
     * @param _amount amount of tokens to mint.
     */
    function mint(address _to, uint256 _amount) external {
        require(_msgSender() == _minter, "SBCToken: not a minter");
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

    /**
     * @dev Allows to transfer any locked token from this contract.
     * Only admin can call this method.
     * @param _token address of the token, if it is not provided (0x00..00), native coins will be transferred.
     * @param _to address that will receive the locked tokens from this contract.
     */
    function claimTokens(address _token, address _to) external onlyAdmin {
        _claimValues(_token, _to);
    }
}
