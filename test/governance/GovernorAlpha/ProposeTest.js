const { expect } = require("chai");
const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');

const { 
  address, 
  etherMantissa,
  encodeParameters,
  mineBlock, 
  expectArray, 
  stopMining, 
  startMining, 
  complete, 
  enfranchise
} = require('../../utils/Utils');


describe('GovernorAlpha Propose', () => {
  let gov, govToken, root, acct;

  before(async () => {
    [root, acct, ...accounts] = await hre.waffle.provider.getWallets();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const GovernorAlpha = await ethers.getContractFactory("GovernorAlpha");

    govToken = await GovernanceToken.deploy(root.address);
    gov = await GovernorAlpha.deploy(
      address(0), 
      govToken.address, 
      root.address, 
      etherMantissa(400000).toString(),
      etherMantissa(1000000).toString(),
      1,
      17280
    );
  });

  let trivialProposal, targets, values, signatures, callDatas;
  let proposalBlock;
  before(async () => {
    targets = [root.address];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(['address'], [acct.address])];

    await enfranchise(govToken, root, '1000000');
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
          await enfranchise(govToken, accounts[0], '1000000');
          await mineBlock(2);

          await stopMining();
          await gov.connect(accounts[0]).propose(targets, values, signatures, callDatas, "do nothing");

          await startMining(false);
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
      await enfranchise(govToken, accounts[2], '400001');

      await mineBlock();
      const nextProposalId = await gov.connect(accounts[2]).callStatic.propose(targets, values, signatures, callDatas, "yoot");

      expect(nextProposalId).equal(trivialProposal.id.add(1));
    });

    it("emits log with id and description", async () => {
      await enfranchise(govToken, accounts[3], '400001');

      await mineBlock();
      const tx = await complete(gov.connect(accounts[3]).propose(targets, values, signatures, callDatas, "yoot"));
      
      expect(tx.events[0].event).equal("ProposalCreated")
    });
  });

  describe("Change proposal settings", async () => {
    it("set proposal threshold", async () => {
      await expectRevert(
        gov.connect(acct).__setProposalThreshold(1000),
        "GovernorAlpha::__setProposalThreshold: sender must be gov guardian"
      )
      await expectRevert(
        gov.__setProposalThreshold(1000),
        "GovernorAlpha::__setProposalThreshold: invalid proposal threshold"
      )
      await gov.__setProposalThreshold(etherMantissa(50000).toString());
      expect(await gov.proposalThreshold()).equal(etherMantissa(50000).toString()); 
    });

    it("set quorum votes", async () => {
      await expectRevert(
        gov.connect(acct).__setQuorumVotes(1000),
        "GovernorAlpha::__setQuorumVotes: sender must be gov guardian"
      )
      await expectRevert(
        gov.__setQuorumVotes(1000),
        "GovernorAlpha::__setQuorumVotes: invalid quorum votes"
      )
      await gov.__setQuorumVotes(etherMantissa(300000).toString());
      expect(await gov.quorumVotes()).equal(etherMantissa(300000).toString()); 
    });

    it("set voting delay", async () => {
      await expectRevert(
        gov.connect(acct).__setVotingDelay(10),
        "GovernorAlpha::__setVotingDelay: sender must be gov guardian"
      )
      await expectRevert(
        gov.__setVotingDelay(100000),
        "GovernorAlpha::__setVotingDelay: invalid voting delay"
      )
      await gov.__setVotingDelay(10);
      expect(await gov.votingDelay()).equal(10); 
    });

    it("set voting period", async () => {
      await expectRevert(
        gov.connect(acct).__setVotingPeriod(1000),
        "GovernorAlpha::__setVotingPeriod: sender must be gov guardian"
      )
      await expectRevert(
        gov.__setVotingPeriod(1000),
        "GovernorAlpha::__setVotingPeriod: invalid voting period"
      )
      await gov.__setVotingPeriod(6000);
      expect(await gov.votingPeriod()).equal(6000); 
    });
  })
});
