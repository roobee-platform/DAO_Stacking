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
    
    token = await Token.attach('0xe64f5cb844946c1f102bd25bbd87a5ab4ae89fbe'/*ROOBEE ADDRESS*/);
    console.log(`REACT_APP_ROOBEE_ADDRESS=${token.address}`);

    // Initialize contracts
    govToken = await GovernanceToken.deploy(account.address, {gasLimit: 8000000});
    console.log(`REACT_APP_GOV_ROOBEE_ADDRESS=${govToken.address}`);

    timelock = await Timelock.deploy(account.address, 172800/*DELAY VALUE*/, {gasLimit: 8000000});

    governor = await Governor.deploy(
        timelock.address, 
        govToken.address,
        account.address,
        etherMantissa(2000000).toString()/*PROPOSAL THRESHOLD*/,
        etherMantissa(4000000).toString()/*QUORUM VOTES*/,
        720/*VOTING DELAY*/,
        86400/*VOTING PERIOD*/,
        {gasLimit: 8000000}
    );
    console.log(`REACT_APP_GOVERNOR_ADDRESS=${governor.address}`);


    staking = await upgrades.deployProxy(Staking,
        [
            govToken.address,
            token.address,
            govToken.address,
            172800,
            10,
            10
        ],
        { initializer: 'init' });

    console.log(`REACT_APP_STAKING_ADDRESS=${staking.address}`)

    await govToken.setMinter(staking.address, {gasLimit: 8000000});

    console.log("Setup complete");
}

main()
 