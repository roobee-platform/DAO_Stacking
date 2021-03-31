const { expect } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');

const { encodeParameters, enfranchise, mineBlock, both, increaseTime } = require('../../utils/Utils');

states = {
  Pending: 0,
  Active: 1,
  Canceled: 2,
  Defeated: 3,
  Succeeded: 4,
  Queued: 5,
  Expired: 6,
  Executed: 7
};


describe('GovernorAlpha State', () => {
  let govToken, gov, root, acct, delay, timelock;

  before(async () => {
    [root, acct, ...accounts] = await hre.waffle.provider.getWallets();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const GovernorExpress = await ethers.getContractFactory("GovernorExpress");
    const TimelockHarness = await ethers.getContractFactory("TimelockHarness");

    govToken = await GovernanceToken.deploy(root.address);
    timelock = await TimelockHarness.deploy(root.address, 4 * 24 * 60 * 60);
    gov = await GovernorExpress.deploy(timelock.address, govToken.address, root.address);
    await timelock.harnessSetAdmin(gov.address);
    await enfranchise(govToken, acct, 4000000);
  });

  let trivialProposal, targets, values, signatures, callDatas;
  before(async () => {
    targets = [root.address];
    values = ["0"];
    signatures = ["getBalanceOf(address)"]
    callDatas = [encodeParameters(['address'], [acct.address])];

    await enfranchise(govToken, root, 4000000);
    await mineBlock();
    await gov.propose(targets, values, signatures, callDatas, "do nothing");
    proposalId = await gov.latestProposalIds(root.address);
    trivialProposal = await gov.proposals(proposalId);
  });

  it("Invalid for proposal not found", async () => {
    await expectRevert(
      gov.state(5),
      "revert GovernorAlpha::state: invalid proposal id"
    );
  });

  it("Pending", async () => {
    expect(await gov.state(trivialProposal.id)).equal(states.Pending);
  });

  it("Active", async () => {
    await mineBlock(2);
    expect(await gov.state(trivialProposal.id)).equal(states.Active);
  });

  it("Canceled", async () => {
    await enfranchise(govToken, accounts[0], 4000000);
    await mineBlock();
    await gov.connect(accounts[0]).propose(targets, values, signatures, callDatas, "do nothing");
    const newProposalId = await gov.latestProposalIds(accounts[0].address);

    await govToken.connect(accounts[0]).delegate(root.address);
    await gov.cancel(newProposalId);

    expect(await gov.state(newProposalId)).equal(states.Canceled);
  });

  it("Defeated", async () => {
    await mineBlock(30);
    expect(await gov.state(trivialProposal.id)).equal(states.Defeated);
  });

  it("Succeeded", async () => {
    await mineBlock();
    const { reply: newProposalId } = await both(gov.connect(acct), 'propose', [targets, values, signatures, callDatas, "do nothing"]);
    await mineBlock();

    await gov.castVote(newProposalId, true);
    await mineBlock(30);

    expect(await gov.state(newProposalId)).equal(states.Succeeded);
  });

  it("Queued", async () => {
    await mineBlock()
    const { reply: newProposalId } = await both(gov.connect(acct), 'propose', [targets, values, signatures, callDatas, "do nothing"]);
    await mineBlock()

    await gov.castVote(newProposalId, true);
    await mineBlock(30);

    await gov.connect(acct).queue(newProposalId);
    expect(await gov.state(newProposalId)).equal(states.Queued);
  });

  it("Expired", async () => {
    await mineBlock()
    const { reply: newProposalId } = await both(gov.connect(acct), 'propose', [targets, values, signatures, callDatas, "do nothing"]);
    await mineBlock()

    await gov.castVote(newProposalId, true);
    await mineBlock(30);

    await increaseTime(1);
    await gov.connect(acct).queue(newProposalId);

    let gracePeriod = await timelock.GRACE_PERIOD();
    let p = await gov.proposals(newProposalId);
    let timestamp = (await ethers.provider.getBlock()).timestamp;
    await increaseTime(gracePeriod.add(p.eta).sub(timestamp).sub(1).toNumber());
    await mineBlock();

    expect(await gov.state(newProposalId)).equal(states.Queued);

    await increaseTime(1);
    await mineBlock();

    expect(await gov.state(newProposalId)).equal(states.Expired);
  });

  it("Executed", async () => {
    await mineBlock();
    const { reply: newProposalId } = await both(gov.connect(acct), 'propose', [targets, values, signatures, callDatas, "do nothing"]);
    await mineBlock();

    await gov.castVote(newProposalId, true);
    await mineBlock(30);

    await increaseTime(1);
    await gov.connect(acct).queue(newProposalId);

    let gracePeriod = await timelock.GRACE_PERIOD();
    let p = await gov.proposals(newProposalId);
    let timestamp = (await ethers.provider.getBlock()).timestamp;
    await increaseTime(gracePeriod.add(p.eta).sub(timestamp).sub(1000).toNumber());
    await mineBlock();

    await gov.connect(acct).execute(newProposalId);
    expect(await gov.state(newProposalId)).equal(states.Executed);

    // stays executed in future, even after time expires
    await increaseTime(10000);
    expect(await gov.state(newProposalId)).equal(states.Executed);
  });

})