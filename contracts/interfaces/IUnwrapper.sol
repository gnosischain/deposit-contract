// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

interface IUnwrapper {
    /**
     * @dev Swaps some of the wrapped tokens to the whitelisted token.
     * Wrapped tokens will be burned.
     * @param _token Address of the whitelisted token contract.
     * @param _amount Amount of tokens to swap.
     * @return Amount of returned tokens.
     */
    function unwrap(address _token, uint256 _amount) external returns (uint256);
}
