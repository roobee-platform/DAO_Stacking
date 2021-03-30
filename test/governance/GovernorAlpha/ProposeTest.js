const { address, etherMantissa, encodeParameters, mineBlock, expectArray, stopMining, startMining, complete } = require('../../utils/Utils');

const { expect } = require("chai");
const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');

describe('GovernorAlpha Propose', () => {
  let gov, comp, root, acct;

  before(async () => {
    [root, acct, ...accounts] = await hre.waffle.provider.getWallets();

    const Comp = await ethers.getContractFactory("Comp");
    const GovernorAlpha = await ethers.getContractFactory("GovernorAlpha");

    comp = await Comp.deploy(root.address);
    gov = await GovernorAlpha.deploy(address(0), comp.address, address(0));
    
    //comp = await deploy('Comp', [root]);
    //gov = await deploy('GovernorAlpha', [address(0), comp._address, address(0)]);
  });

  let trivialProposal, targets, values, signatures, callDatas;
  let proposalBlock;
  before(async () => {
    targets = [root.address];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(['address'], [acct.address])];

    await comp.delegate(root.address);
    await gov.propose(targets, values, signatures, callDatas, "do nothing");

    proposalBlock = +(await ethers.provider.getBlockNumber());
    proposalId = await gov.latestProposalIds(root.address);
    trivialProposal = await gov.proposals(proposalId);
  });

  it("Given the sender's GetPriorVotes for the immediately previous block is above the Proposal Threshold (e.g. 2%), the given proposal is added to all proposals, given the following settings", async () => {
    //test.todo('depends on get prior votes and delegation and voting');
  });

  describe("simple initialization", () => {
    it("ID is set to a globally unique identifier", async () => {
      expect(trivialProposal.id).equal(proposalId);
    });

    it("Proposer is set to the sender", async () => {
      expect(trivialProposal.proposer).equal(root.address);
    });

    it("Start block is set to the current block number plus vote delay", async () => {
      expect(trivialProposal.startBlock).equal(proposalBlock + 1 + "");
    });

    it("End block is set to the current block number plus the sum of vote delay and vote period", async () => {
      expect(trivialProposal.endBlock).equal(proposalBlock + 1 + 17280);
    });

    it("ForVotes and AgainstVotes are initialized to zero", async () => {
      expect(trivialProposal.forVotes).equal(0);
      expect(trivialProposal.againstVotes).equal(0);
    });

    it("Executed and Canceled flags are initialized to false", async () => {
      expect(trivialProposal.canceled).equal(false);
      expect(trivialProposal.executed).equal(false);
    });

    it("ETA is initialized to zero", async () => {
      expect(trivialProposal.eta).equal(0);
    });

    it("Targets, Values, Signatures, Calldatas are set according to parameters", async () => {
      let dynamicFields = await gov.getActions(trivialProposal.id);
      expectArray(dynamicFields.targets, targets);
      expectArray(dynamicFields.values, values);
      expectArray(dynamicFields.signatures, signatures);
      expectArray(dynamicFields.calldatas, callDatas);
    });

    describe("This function must revert if", () => {
      it("the length of the values, signatures or calldatas arrays are not the same length,", async () => {
        await expectRevert(
          gov.propose(targets.concat(root.address), values, signatures, callDatas, "do nothing"),
          "revert GovernorAlpha::propose: proposal function information arity mismatch"
        );

        await expectRevert(
          gov.propose(targets, values.concat(values), signatures, callDatas, "do nothing"),
          "revert GovernorAlpha::propose: proposal function information arity mismatch"
        );

        await expectRevert(
          gov.propose(targets.concat(root.address), values, signatures.concat(signatures), callDatas, "do nothing"),
          "revert GovernorAlpha::propose: proposal function information arity mismatch"
        );

        await expectRevert(
          gov.propose(targets.concat(root.address), values, signatures, callDatas.concat(callDatas), "do nothing"),
          "revert GovernorAlpha::propose: proposal function information arity mismatch"
        );
      });

      it("or if that length is zero or greater than Max Operations.", async () => {
        await expectRevert(
          gov.propose([], [], [], [], "do nothing"),
          "revert GovernorAlpha::propose: must provide actions"
        );
      });

      describe("Additionally, if there exists a pending or active proposal from the same proposer, we must revert.", () => {
        it("reverts with pending", async () => {
          await complete(comp.transfer(accounts[0].address, etherMantissa('1000000').toString()));
          await comp.connect(accounts[0]).delegate(accounts[0].address);
          mineBlock(2);

          stopMining();
          await gov.connect(accounts[0]).propose(targets, values, signatures, callDatas, "do nothing");

          startMining(false);
          await expectRevert(
            gov.connect(accounts[0]).propose(targets, values, signatures, callDatas, "do nothing"),
            "revert GovernorAlpha::propose: one live proposal per proposer, found an already pending proposal"
          );
        });

        it("reverts with active", async () => {
          await mineBlock(2);

          await expectRevert(
            gov.propose(targets, values, signatures, callDatas, "do nothing"),
            "revert GovernorAlpha::propose: one live proposal per proposer, found an already active proposal"
          );
        });
      });
    });

    it("This function returns the id of the newly created proposal. # proposalId(n) = succ(proposalId(n-1))", async () => {
      await comp.transfer(accounts[2].address, etherMantissa(400001).toString());
      await comp.connect(accounts[2]).delegate(accounts[2].address);

      await mineBlock();
      const nextProposalId = await gov.connect(accounts[2]).callStatic.propose(targets, values, signatures, callDatas, "yoot");

      expect(nextProposalId).equal(trivialProposal.id.add(1));
    });

    it("emits log with id and description", async () => {
      await comp.transfer(accounts[3].address, etherMantissa(400001).toString());
      await comp.connect(accounts[3]).delegate(accounts[3].address);
      await mineBlock();

      const tx = await complete(gov.connect(accounts[3]).propose(targets, values, signatures, callDatas, "yoot"));
      expect(tx.events[0].event).equal("ProposalCreated")
    });
  });
});
