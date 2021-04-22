const { expect } = require("chai");
//const { timeTravel } = require('./helpers/timetravel');

describe("Stacking Contract", function () {

    let roobeeStacking;
    let roobeeStackingAddress;
    let tokenManager;
    let tokenManagerAddress;
    let gToken;
    let gTokenAddress;
    let stakingToken;
    let stakingTokenAddress;

    beforeEach(async function () {
        // Get the ContractFactory and Signers here.
        let StandartToken = await ethers.getContractFactory("StandartToken");
        //let TokenManager = await ethers.getContractFactory("MockTokenManager");
        let GovernanceToken = await ethers.getContractFactory("GovernanceToken");
        let DAOStacking = await ethers.getContractFactory("DAOStacking");

        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        // To deploy our contract, we just have to call Token.deploy() and await
        // for it to be deployed(), which happens onces its transaction has been
        // mined.

        stakingToken = await StandartToken.deploy("Roobee", "Roobee", 18, 300000000000000);
        stakingTokenAddress = await stakingToken.address;

        gToken = await GovernanceToken.deploy(owner.address);
        gTokenAddress = await gToken.address;

        roobeeStacking = await DAOStacking.deploy();
        roobeeStackingAddress = await roobeeStacking.address;
        await gToken.setMinter(roobeeStackingAddress);

        await roobeeStacking.init(stakingTokenAddress, stakingTokenAddress, gTokenAddress, 100000, 10, 10);
        await stakingToken.transfer(roobeeStackingAddress, 100000000000000)
        await roobeeStacking.notifyRewardAmount(100000000000000);
    });


    describe("Deployment", function () {

        it("should set the right minter", async function () {
            console.log(await roobeeStacking.tokenManager());
            console.log(await roobeeStacking.rewardsToken());
            console.log(await roobeeStacking.stakingToken());
            console.log(await roobeeStacking.rewardsDuration());
            console.log(await roobeeStacking.exchangeRate());
        });
    });

    describe("Stacking", function () {
       it("not-anual deposit and withdraw should work", async function (){

           let ownerAddress = owner.address;
           await stakingToken.approve(roobeeStackingAddress, 100);
           await roobeeStacking.deposit(100, false, ownerAddress);
           expect(await roobeeStacking.balanceOf(owner.address)).to.equal(100);
           expect(await gToken.balanceOf(owner.address)).to.equal(10);

           await roobeeStacking.withdraw(100);
           expect(await roobeeStacking.balanceOf(owner.address)).to.equal(0);
           expect(await gToken.balanceOf(owner.address)).to.equal(0);

       });

       it("anual deposit should work", async function (){
           let ownerAddress = owner.address;
           await stakingToken.approve(roobeeStackingAddress, 100);
           await roobeeStacking.deposit(100, true, ownerAddress);
           expect(await roobeeStacking.balanceOf(owner.address)).to.equal(100);
           expect(await gToken.balanceOf(owner.address)).to.equal(10);
           expect(await roobeeStacking.unlockedBalanceOf(owner.address)).to.equal(0);


           await stakingToken.approve(roobeeStackingAddress, 200);
           await roobeeStacking.deposit(200, true, ownerAddress);
           expect(await roobeeStacking.balanceOf(owner.address)).to.equal(300);
           expect(await gToken.balanceOf(owner.address)).to.equal(30);
           expect(await roobeeStacking.unlockedBalanceOf(owner.address)).to.equal(0);

           expect((await roobeeStacking.lockedBalanceOf(owner.address))[0]["amount"]).to.equal(100);
           expect((await roobeeStacking.lockedBalanceOf(owner.address))[1]["amount"]).to.equal(200);


           await expect(roobeeStacking.unlock(200)).to.be.revertedWith("ERROR_NOT_ENOUGH_TOKENS_TO_UNLOCK");
           await expect(roobeeStacking.unlock(1)).to.be.revertedWith("ERROR_NOT_ENOUGH_TOKENS_TO_UNLOCK");
           await expect(roobeeStacking.withdraw(200)).to.be.revertedWith("SafeMath: subtraction overflow");
           await expect(roobeeStacking.withdraw(1)).to.be.revertedWith("SafeMath: subtraction overflow");

           await ethers.provider.send('evm_increaseTime', [34560000]);
           await ethers.provider.send('evm_mine', []);


           await roobeeStacking.unlock(20);

           expect(await gToken.balanceOf(owner.address)).to.equal(30);
           expect(await roobeeStacking.balanceOf(owner.address)).to.equal(280);
           expect(await roobeeStacking.unlockedBalanceOf(owner.address)).to.equal(0);

           expect((await roobeeStacking.lockedBalanceOf(owner.address))[0]["amount"]).to.equal(80);
           expect((await roobeeStacking.lockedBalanceOf(owner.address))[1]["amount"]).to.equal(200);

           console.log((await roobeeStacking.earned(owner.address)).toNumber())

       });

       it("rewards ", async function(){
           let ownerAddress = owner.address;
           await stakingToken.approve(roobeeStackingAddress, 100);
           await roobeeStacking.deposit(100, false, ownerAddress);
           expect(await roobeeStacking.earned(owner.address)).to.equal(0);
           await ethers.provider.send('evm_increaseTime', [100000]);
           await ethers.provider.send('evm_mine', []);
           let earned = (await roobeeStacking.earned(owner.address)).toNumber()
           let balanceBefore = (await stakingToken.balanceOf(owner.address)).toNumber()
           await roobeeStacking.withdraw(50);
           expect(await roobeeStacking.balanceOf(owner.address)).to.equal(50);
           expect((await stakingToken.balanceOf(owner.address)).toNumber()).to.equal(balanceBefore+earned+50);
           expect(await roobeeStacking.earned(owner.address)).to.equal(0);
           await ethers.provider.send('evm_increaseTime', [100000]);
           await ethers.provider.send('evm_mine', []);
           expect(await roobeeStacking.earned(owner.address)).to.equal(0);
       });



    });
});