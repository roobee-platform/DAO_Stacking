const {
  encodeParameters,
  freezeTime,
} = require('../Utils/Ethereum');

const { etherMantissa, mineBlock, both, complete, advanceBlocks, stopMining, startMining } = require('../../utils/Utils');
const { expectRevert } = require('@openzeppelin/test-helpers');

async function enfranchise(comp, actor, amount) {
  await comp.transfer(actor.address, etherMantissa(amount).toString());
  await comp.connect(actor).delegate(actor.address);
}

describe('GovernorAlpha Queue', () => {
  let root, a1, a2, accounts;
  let timelock, comp, gov, txAdmin;

  before(async () => {
    [root, a1, a2, ...accounts] = await hre.waffle.provider.getWallets();
  });

  beforeEach(async () => {
    const TimelockHarness = await ethers.getContractFactory("TimelockHarness");
    const Comp = await ethers.getContractFactory("Comp");
    const GovernorExpress = await ethers.getContractFactory("GovernorExpress");

    timelock = await TimelockHarness.deploy(root.address, 86400 * 2);
    comp = await Comp.deploy(root.address);
    gov = await GovernorExpress.deploy(timelock.address, comp.address, root.address);
    txAdmin = await timelock.harnessSetAdmin(gov.address);
  });

  describe("overlapping actions", () => {
    it("reverts on queueing overlapping actions in same proposal", async () => {
      await enfranchise(comp, a1, 3e6);
      await mineBlock();

      const targets = [comp.address, comp.address];
      const values = ["0", "0"];
      const signatures = ["getBalanceOf(address)", "getBalanceOf(address)"];
      const calldatas = [encodeParameters(['address'], [root.address]), encodeParameters(['address'], [root.address])];

      const {reply: proposalId1} = await both(gov.connect(a1), 'propose', [targets, values, signatures, calldatas, "do nothing"]);
      await mineBlock();

      const txVote1 = await complete(gov.connect(a1).castVote(proposalId1, true));
      await mineBlock(30);

      await expectRevert(
        gov.queue(proposalId1),
        "revert GovernorAlpha::_queueOrRevert: proposal action already queued at eta"
      );
    });

    it("reverts on queueing overlapping actions in different proposals, works if waiting", async () => {

      await enfranchise(comp, a1, 3e6);
      await enfranchise(comp, a2, 3e6);
      await mineBlock();

      const targets = [comp.address];
      const values = ["0"];
      const signatures = ["getBalanceOf(address)"];
      const calldatas = [encodeParameters(['address'], [root.address])];
      const {reply: proposalId1} = await both(gov.connect(a1), 'propose', [targets, values, signatures, calldatas, "do nothing"]);
      const {reply: proposalId2} = await both(gov.connect(a2), 'propose', [targets, values, signatures, calldatas, "do nothing"]);
      await mineBlock();

      const txVote1 = await complete(gov.connect(a1).castVote(proposalId1, true));
      const txVote2 = await complete(gov.connect(a2).castVote(proposalId2, true));
      await mineBlock(30);

      stopMining();
      await gov.queue(proposalId1);

      startMining(mineNow = false);
      await expectRevert(
        gov.queue(proposalId2),
        "revert GovernorAlpha::_queueOrRevert: proposal action already queued at eta"
      )

      await gov.queue(proposalId2);
    });
  });
});
