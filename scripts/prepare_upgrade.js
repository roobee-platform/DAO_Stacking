// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
    // Hardhat always runs the compile task when running scripts with its command
    // line interface.
    //
    // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    // await hre.run('compile');

    // We get the contract to deploy
    const proxyAddress = '0x0f377beC5C9504bc960c231E29bdF8a63B919052';
    const RoobeeStacking = await hre.ethers.getContractFactory("DAOStacking");
    const roobeeStackingV2Address = await upgrades.prepareUpgrade(proxyAddress, RoobeeStacking)
    console.log("roobeeStacking deployed to:", roobeeStackingV2Address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
