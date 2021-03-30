const { splitSignature } = require("@ethersproject/bytes");
const { ethers } = require("hardhat");

function address(n) {
    return `0x${n.toString(16).padStart(40, '0')}`;
}

async function signMessage(signer, domain, types, message) {
    return splitSignature(await signer._signTypedData(domain, types, message));
}

async function mineBlock(count = 1) {
    for (var i = 0; i < count; i++) {
        await ethers.provider.send('evm_mine', []);
    }
}

async function complete(contractCall) {
    return await (await contractCall).wait();
}

async function stopMining() {
    await ethers.provider.send("evm_setAutomine", [false]);
    await ethers.provider.send('evm_setIntervalMining', [1e9]);
}

async function startMining() {
    await ethers.provider.send("evm_setAutomine", [true]);
    await ethers.provider.send('evm_setIntervalMining', [0]);
    await ethers.provider.send('evm_mine', []);
}

module.exports = { address, signMessage, mineBlock, complete, stopMining, startMining };