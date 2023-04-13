// SPDX-License-Identifier: CC0-1.0

pragma solidity ^0.8.9;

import "../SBCDepositContractProxy.sol";
import "../SBCToken.sol";
import "../SBCTokenProxy.sol";
import "../SBCWrapper.sol";
import "../SBCWrapperProxy.sol";
import "./UnsafeToken.sol";

contract SBCInit {
    constructor(
        address admin,
        uint256 initialGNOStake,
        address mGNOTokenProxyAddr,
        address GNOTokenProxyAddr,
        address depositProxyAddr,
        address wrapperProxyAddr
    ) {
        SBCToken mGNOToken = SBCToken(mGNOTokenProxyAddr);
        UnsafeToken GNOToken = UnsafeToken(GNOTokenProxyAddr);
        SBCDepositContractProxy depositContractProxy = SBCDepositContractProxy(payable(depositProxyAddr));
        SBCWrapper wrapper = SBCWrapper(wrapperProxyAddr);

        // Enable wrapper
        mGNOToken.setMinter(wrapperProxyAddr);
        wrapper.enableToken(GNOTokenProxyAddr, 32);

        // Mint initial stake
        // With UnsafeToken the admin can already mint. Mint GNO directly to deposit contract
        GNOToken.mint(depositProxyAddr, initialGNOStake);

        // Prefund the admin account with some balance to test deposits
        GNOToken.mint(admin, initialGNOStake);

        // Change default admin on deploy (system sender) to actual admin
        depositContractProxy.setAdmin(admin);
        SBCTokenProxy(payable(mGNOTokenProxyAddr)).setAdmin(admin);
        SBCTokenProxy(payable(GNOTokenProxyAddr)).setAdmin(admin);
        SBCWrapperProxy(payable(wrapperProxyAddr)).setAdmin(admin);
    }
}
