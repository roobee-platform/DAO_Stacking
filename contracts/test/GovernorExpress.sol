pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../governance/GovernorAlpha.sol";

contract GovernorExpress is GovernorAlpha {
    /// @notice The minimum setable voting period
    uint public constant MIN_VOTING_PERIOD = 1; 

    constructor(address timelock_, address comp_, address guardian_)
    public
    GovernorAlpha(timelock_, comp_, guardian_, 400000e18, 1000000e18, 1, 17280) {
        votingPeriod = 25;
    }
}