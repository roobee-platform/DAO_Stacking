pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../governance/GovernorAlpha.sol";

contract GovernorExpress is GovernorAlpha {
    /// @notice The minimum setable voting period
    uint public constant MIN_VOTING_PERIOD = 1; 

    /// @notice The minimum setable proposal threshold
    uint public constant MIN_PROPOSAL_THRESHOLD = 200000e18; // 200,000 xRoobee

    constructor(address timelock_, address comp_, address guardian_)
    public
    GovernorAlpha(timelock_, comp_, guardian_, 2000000e18, 8000000e18, 1, 17280) {
        proposalThreshold = 400000;
        quorumVotes = 1000000;
        votingPeriod = 25;
    }
}
