// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IUnwrapper.sol";
import "./utils/PausableEIP1967Admin.sol";
import "./SBCToken.sol";
import "./SBCDepositContract.sol";

/**
 * @title SBCWrapper
 * @dev Wrapper engine contract for minting wrapped tokens that can be deposited into SBC.
 * Used for wrapping of STAKE and other possible ERC20 tokens.
 */
contract SBCWrapper is IERC677Receiver, PausableEIP1967Admin, Claimable, ReentrancyGuard, IUnwrapper {
    using SafeERC20 for IERC20;

    enum TokenStatus {
        DISABLED,
        ENABLED,
        PAUSED
    }

    mapping(address => TokenStatus) public tokenStatus;
    // if tokenRate[A] = X, then user will receive Y * X / 10**18 wrapped tokens for locking Y of A tokens.
    mapping(address => uint256) public tokenRate;

    SBCToken public immutable sbcToken;
    SBCDepositContract public immutable sbcDepositContract;

    event Swap(address indexed token, address indexed user, uint256 amount, uint256 received);
    event SwapRateUpdated(address indexed token, uint256 rate);
    event TokenSwapEnabled(address indexed token);
    event TokenSwapPaused(address indexed token);
    event Unwrap(address indexed token, address indexed user, uint256 amount, uint256 received);

    constructor(SBCToken _sbcToken, SBCDepositContract _depositContract) {
        sbcToken = _sbcToken;
        sbcDepositContract = _depositContract;
    }

    /**
     * @dev Enables swapping of new token into wrapped SBC token at a given rate.
     * Only admin can call this method.
     * @param _token address of the enabled or reenabled token contract.
     * @param _rate exchange rate for the new pair, multiplied by 10**18.
     */
    function enableToken(address _token, uint256 _rate) external onlyAdmin {
        require(_rate > 0, "SBCWrapper: invalid rate");

        TokenStatus oldStatus = tokenStatus[_token];
        tokenStatus[_token] = TokenStatus.ENABLED;
        tokenRate[_token] = _rate;

        if (oldStatus != TokenStatus.ENABLED) {
            emit TokenSwapEnabled(_token);
        }
        emit SwapRateUpdated(_token, _rate);
    }

    /**
     * @dev Temporary pauses swapping of some particular token, which can be reenaled later.
     * Only admin can call this method.
     * @param _token address of the paused token contract.
     */
    function pauseToken(address _token) external onlyAdmin {
        require(tokenStatus[_token] == TokenStatus.ENABLED, "SBCWrapper: token is not enabled");

        tokenStatus[_token] = TokenStatus.PAUSED;
        emit TokenSwapPaused(_token);
    }

    /**
     * @dev Swaps some of the whitelisted tokens for the newly created wrapped tokens.
     * Tokens must be pre-approved before calling this function.
     * @param _token address of the swapped token contract.
     * @param _amount amount of tokens to swap.
     * @param _permitData optional permit calldata to use for preliminary token approval.
     * supports STAKE permit and EIP2612 standards.
     */
    function swap(
        address _token,
        uint256 _amount,
        bytes calldata _permitData
    ) external nonReentrant whenNotPaused {
        require(tokenStatus[_token] == TokenStatus.ENABLED, "SBCWrapper: token is not enabled");

        if (_permitData.length > 4) {
            // supported signatures:
            // permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)
            // permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
            require(
                bytes4(_permitData[0:4]) == bytes4(0x8fcbaf0c) || bytes4(_permitData[0:4]) == bytes4(0xd505accf),
                "SBCWrapper: invalid permit signature"
            );
            (bool status, ) = _token.call(_permitData);
            require(status, "SBCWrapper: permit failed");
        }

        address sender = _msgSender();

        // We do not plan to support any deflationary or rebasing tokens in this contract
        // so it is not required to check that ERC20 balance has indeed change.
        // It is an admin responsibility to carefully check that enabled token correctly implements ERC20 standard.
        IERC20(_token).safeTransferFrom(sender, address(this), _amount);

        _swapTokens(sender, _token, _amount);
    }

    /**
     * @dev ERC677 callback for swapping tokens in the simpler way during transferAndCall.
     * @param from address of the received token contract.
     * @param value amount of the received tokens.
     * @param data should be empty for a simple token swap, otherwise will pass it further to the deposit contract.
     */
    function onTokenTransfer(
        address from,
        uint256 value,
        bytes calldata data
    ) external override nonReentrant whenNotPaused returns (bool) {
        address token = _msgSender();
        require(tokenStatus[token] == TokenStatus.ENABLED, "SBCWrapper: token is not enabled");

        if (data.length == 0) {
            _swapTokens(from, token, value);
        } else {
            uint256 swappedAmount = _swapTokens(address(this), token, value);
            sbcToken.transferAndCall(address(sbcDepositContract), swappedAmount, data);
        }

        return true;
    }

    /**
     * @dev Allows to transfer any locked token from this contract.
     * Only admin can call this method.
     * While it is not allowed to claim previously enabled or paused tokens,
     * the admin should still verify that the claimed token is a valid ERC20 token contract.
     * @param _token address of the token, if it is not provided (0x00..00), native coins will be transferred.
     * @param _to address that will receive the locked tokens on this contract.
     */
    function claimTokens(address _token, address _to) external onlyAdmin {
        require(tokenStatus[_token] == TokenStatus.DISABLED, "SBCWrapper: token already swappable");

        _claimValues(_token, _to);
    }

    function _swapTokens(
        address _receiver,
        address _token,
        uint256 _amount
    ) internal returns (uint256) {
        uint256 acquired = (_amount * tokenRate[_token]) / 1 ether;
        require(acquired > 0, "SBCWrapper: invalid amount");

        sbcToken.mint(_receiver, acquired);

        emit Swap(_token, _receiver, _amount, acquired);

        return acquired;
    }

    /**
     * @dev Swaps some of the wrapped tokens to the whitelisted token.
     * Wrapped tokens will be burned.
     * @param _token Address of the whitelisted token contract.
     * @param _amount Amount of tokens to swap.
     * @return Amount of returned tokens.
     */
    function unwrap(
        address _token,
        uint256 _amount
    ) external returns (uint256) {
        require(tokenStatus[_token] == TokenStatus.ENABLED, "SBCWrapper: token is not enabled");

        address sender = _msgSender();
        sbcToken.burn(sender, _amount);

        uint256 returned = (_amount * 1 ether) / tokenRate[_token];

        IERC20(_token).safeTransfer(sender, returned);

        emit Unwrap(_token, sender, _amount, returned);
    }
}
