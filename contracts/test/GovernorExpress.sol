pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../governance/GovernorAlpha.sol";

contract GovernorExpress is GovernorAlpha {
    constructor(address timelock_, address comp_, address guardian_)
    public
    GovernorAlpha(timelock_, comp_, guardian_) {}

    function votingPeriod() public pure returns (uint) { return 25; } // voting period reduced for testing purposes
}