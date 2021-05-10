const { ethers } = require("hardhat");
const hre = require("hardhat");
const { etherMantissa, address } = require("../test/utils/Utils");

async function main() {
    account = (await ethers.getSigners())[0];

    Token = await ethers.getContractFactory('StandartToken');
    GovernanceToken = await ethers.getContractFactory('GovernanceToken');
    Governor = await ethers.getContractFactory('GovernorExpress');
    Staking  = await ethers.getContractFactory('DAOStacking');
    
    token = await Token.deploy('Roobee', 'ROOBEE', 18, etherMantissa(100000000).toString());
    // token = await Token.attach('');

    // Initialize contracts
    govToken = await GovernanceToken.deploy(account.address);
    governor = await Governor.deploy(address(0), govToken.address, account.address);
    staking = await Staking.deploy();
    await staking.init(govToken.address, token.address, govToken.address);
    await govToken.setMinter(staking.address);

    // Log addresses
    console.log(`REACT_APP_ROOBEE_ADDRESS=${token.address}`);
    console.log(`REACRT_APP_GOV_ROOBEE_ADDRESS=${govToken.address}`)
    console.log(`REACT_APP_STAKING_ADDRESS=${staking.address}`)
    console.log(`REACT_APP_GOVERNOR_ADDRESS=${governor.address}`)
}

