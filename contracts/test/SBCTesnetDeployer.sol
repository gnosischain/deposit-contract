pragma solidity 0.8.9;

import "../SBCToken.sol";
import "../SBCTokenProxy.sol";
import "../SBCDepositContract.sol";
import "../SBCDepositContractProxy.sol";
import "../SBCWrapper.sol";
import "../SBCWrapperProxy.sol";
import "../SBCDepositContract.sol";

/**
 * @title SBCTesnetDeployer
 * @dev Deployes all required contracts in one transaction
 */
contract SBCTesnetDeployer {
    SBCToken public immutable stakeToken;
    SBCToken public immutable token;
    SBCDepositContract public immutable depositContract;
    SBCWrapper public immutable wrapper;

    constructor(address _admin, uint256 _initialStake) {
        // deploy stake token, use SBCTokenProxy because it's already available in the repo
        SBCTokenProxy stakeTokenProxy = new SBCTokenProxy(_admin, "Stake GNO", "GNO");
        stakeToken = SBCToken(address(stakeTokenProxy));

        // deploy token
        SBCTokenProxy tokenProxy = new SBCTokenProxy(_admin, "SBC Token", "SBCT");
        token = SBCToken(address(tokenProxy));

        // deploy deposit contract
        SBCDepositContractProxy depositContractProxy = new SBCDepositContractProxy(
            _admin,
            address(tokenProxy),
            address(stakeToken),
            address(stakeToken)
        );
        depositContract = SBCDepositContract(address(depositContractProxy));

        // deploy token wrapper
        SBCWrapperProxy wrapperProxy = new SBCWrapperProxy(_admin, token, depositContract);
        wrapper = SBCWrapper(address(wrapperProxy));

        // upgrade deposit with the correct unwrapper address
        SBCDepositContract depositContractImplementationWithUnwrapper = new SBCDepositContract(
            address(tokenProxy),
            address(wrapperProxy),
            address(stakeToken)
        );
        depositContractProxy.upgradeTo(address(depositContractImplementationWithUnwrapper));

        // Enable wrapper
        token.setMinter(address(wrapperProxy));
        wrapper.enableToken(address(stakeToken), 32);

        // Mint initial stake
        stakeToken.setMinter(address(this));
        stakeToken.mint(address(this), _initialStake);
        stakeToken.approve(address(wrapperProxy), _initialStake);
        wrapper.swap(address(stakeToken), _initialStake, "0x");
        token.transfer(address(depositContract), _initialStake);

        // Set permissions, is this necessary? Was in the original 1_deploy.js
        depositContractProxy.setAdmin(_admin);
        tokenProxy.setAdmin(_admin);
        wrapperProxy.setAdmin(_admin);
    }

    /**
     * @dev to retrieve all deploy artifacts in one go
     */
    function get_addresses()
        external
        view
        returns (
            address,
            address,
            address,
            address
        )
    {
        return (address(stakeToken), address(token), address(depositContract), address(wrapper));
    }
}
