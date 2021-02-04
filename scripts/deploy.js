// We require the Hardhat Runtime Environment explicitly here. This is optional 
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");


async function main() {
// Hardhat always runs the compile task when running scripts with its command
// line interface.
//
// If this script is run directly using `node` you may want to call compile
// manually to make sure everything is compiled
// await hre.run('compile');

// We get the contract to deploy

const RoobeeStacking = await hre.ethers.getContractFactory("DAOStacking");
const roobeeStacking = await upgrades.deployProxy(RoobeeStacking,
    [
        "0x547e4f5ef8eab99cdb50eacf282dd224c1480595",
    "0x547e4f5ef8eab99cdb50eacf282dd224c1480595",
        "0x4130c6de6b9a58442357a12bac9010d248cc850c",
        172800,
        10,
        10
    ],
    { initializer: 'init' });
console.log("roobeeStacking deployed to:", roobeeStacking.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
