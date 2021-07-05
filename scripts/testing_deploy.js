const { ethers } = require("hardhat");
const hre = require("hardhat");
const { etherMantissa, address } = require("../test/utils/Utils");

async function main() {
    account = (await ethers.getSigners())[0];

    Token = await ethers.getContractFactory('StandartToken');
    GovernanceToken = await ethers.getContractFactory('GovernanceToken');
    Governor = await ethers.getContractFactory('GovernorAlpha');
    Staking  = await ethers.getContractFactory('DAOStacking');
    Timelock = await ethers.getContractFactory('Timelock');
    
    token = await Token.attach(''/*ROOBEE ADDRESS*/);
    console.log(`REACT_APP_ROOBEE_ADDRESS=${token.address}`);

    // Initialize contracts
    govToken = await GovernanceToken.deploy(account.address, {gasLimit: 8000000});
    console.log(`REACT_APP_GOV_ROOBEE_ADDRESS=${govToken.address}`);

    timelock = await Timelock.deploy(account.address, 10/*DELAY VALUE*/);

    governor = await Governor.deploy(
        timelock.address, 
        govToken.address,
        account.address,
        0/*PROPOSAL THRESHOLD*/,
        0/*QUORUM VOTES*/,
        0/*VOTING DELAY*/,
        0/*VOTING PERIOD*/,
        {gasLimit: 8000000}
    );
    console.log(`REACT_APP_GOVERNOR_ADDRESS=${governor.address}`);

    staking = await Staking.deploy({gasLimit: 8000000});
    console.log(`REACT_APP_STAKING_ADDRESS=${staking.address}`)
    //staking = await Staking.attach('0x9DAa0188d537fB17ef265efbd64f1B8a41d4665b');
    await staking.init(
        govToken.address, 
        token.address, 
        govToken.address,
        172800/*REWARDS DURATION */, 
        10/*EXCHANGRE RATE*/, 
        10/*MAX LOCKS*/,
        {gasLimit: 8000000}
    );

    await govToken.setMinter(staking.address, {gasLimit: 8000000});

    console.log("Setup complete");
}

main()
 