pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../governance/GovernorAlpha.sol";

contract GovernorExpress is GovernorAlpha {
    constructor(address timelock_, address comp_, address guardian_)
    public
    GovernorAlpha(timelock_, comp_, guardian_, 400000e18, 1000000e18, 1, 25) {}
}