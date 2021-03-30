"use strict";

const { splitSignature } = require("@ethersproject/bytes");
const { expect } = require("chai");
const BigNumber = require('bignumber.js');
const { ethers } = require("hardhat");

BigNumber.config({ EXPONENTIAL_AT: 50 })

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
  }  

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

async function startMining(mineNow = true) {
    await ethers.provider.send("evm_setAutomine", [true]);
    await ethers.provider.send('evm_setIntervalMining', [0]);
    if (mineNow) {
        await ethers.provider.send('evm_mine', []);
    }
}

function expectObject(real, expected) {
    for (const key in expected) {
        expect(real[key]).equal(expected[key]);
    }
}

function expectArray(real, expected) {
    for (var i = 0; i < real.length; i++) {
        expect(real[i]).equal(expected[i]);
    } 
}

function etherMantissa(num, scale = 1e18) {
    if (num < 0)
        return new BigNumber(2).pow(256).plus(num);
    return new BigNumber(num).times(scale);
}

async function both(contract, method, args = []) {
    const reply = await contract.callStatic[method](...args);
    const receipt = await contract[method](...args);
    return { reply, receipt };
}

module.exports = { 
    encodeParameters, 
    address, 
    signMessage,
    mineBlock, 
    complete, 
    stopMining, 
    startMining, 
    expectObject, 
    expectArray, 
    etherMantissa,
    both
};