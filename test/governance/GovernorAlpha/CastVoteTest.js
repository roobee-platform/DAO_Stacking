const {
  address,
  etherMantissa,
  encodeParameters,
  mineBlock,
  enfranchise,
  stopMining,
  startMining,
  complete,
  expectObject,
  signMessage
} = require('../../utils/Utils');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

describe("GovernorAlpha CastVote", () => {
  let chainId;
  let govToken, gov;
  let root, a1, accounts;
  let targets, values, signatures, callDatas, proposalId;

  before(async () => {
    [root, a1, ...accounts] = await hre.waffle.provider.getWallets();
    chainId = hre.network.config.chainId;

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const GovernorAlpha = await ethers.getContractFactory("GovernorExpress");

    govToken = await GovernanceToken.deploy(root.address);
    gov = await GovernorAlpha.deploy(address(0), govToken.address, root.address);

    targets = [a1.address];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(['address'], [a1.address])];

    await enfranchise(govToken, root, '1000000');
    mineBlock();
    proposalId = await gov.callStatic.propose(targets, values, signatures, callDatas, "do nothing");
    await stopMining();
    await gov.propose(targets, values, signatures, callDatas, "do nothing");
    await startMining(false);
  });

  describe("We must revert if:", () => {
    it("There does not exist a proposal with matching proposal id where the current block number is between the proposal's start block (exclusive) and end block (inclusive)", async () => {
      await expectRevert(
        gov.castVote(proposalId, true),
        "revert GovernorAlpha::_castVote: voting is closed"
      );
    });

    it("Such proposal already has an entry in its voters set matching the sender", async () => {
      await mineBlock(2);

      await gov.connect(accounts[4]).castVote(proposalId, true);
      expectRevert(
        gov.connect(accounts[4]).castVote(proposalId, true),
        "revert GovernorAlpha::_castVote: voter already voted"
      )
    });
  });

  describe("Otherwise", () => {
    it("we add the sender to the proposal's voters set", async () => {
      expectObject(await gov.getReceipt(proposalId, accounts[2].address), {hasVoted: false})
      await gov.connect(accounts[2]).castVote(proposalId, true);
      expectObject(await gov.getReceipt(proposalId, accounts[2].address), {hasVoted: true})
    });

    describe("and we take the balance returned by GetPriorVotes for the given sender and the proposal's start block, which may be zero,", () => {
      let actor; // an account that will propose, receive tokens, delegate to self, and vote on own proposal

      it("and we add that ForVotes", async () => {
        actor = accounts[1];
        await enfranchise(govToken, actor, 400001);

        await gov.connect(actor).propose(targets, values, signatures, callDatas, "do nothing");
        proposalId = await gov.latestProposalIds(actor.address);

        let beforeFors = (await gov.proposals(proposalId)).forVotes;
        await mineBlock();
        await gov.connect(actor).castVote(proposalId, true);

        let afterFors = (await gov.proposals(proposalId)).forVotes;
        expect(afterFors).equal(beforeFors.add(etherMantissa(400001).toString()));
      })

      it("or AgainstVotes corresponding to the caller's support flag.", async () => {
        actor = accounts[3];
        await enfranchise(govToken, actor, 400001);

        await gov.connect(actor).propose(targets, values, signatures, callDatas, "do nothing");
        proposalId = await gov.latestProposalIds(actor.address);

        let beforeAgainsts = (await gov.proposals(proposalId)).againstVotes;
        await mineBlock();
        await gov.connect(actor).castVote(proposalId, false);

        let afterAgainsts = (await gov.proposals(proposalId)).againstVotes;
        expect(afterAgainsts).equal(beforeAgainsts.add(etherMantissa(400001).toString()));
      });
    });

    describe('castVoteBySig', () => {
      const Domain = (gov) => ({ 
        name: 'Roobee Governor Alpha', 
        chainId, 
        verifyingContract: gov.address 
      });
      const Types = {
        Ballot: [
          { name: 'proposalId', type: 'uint256' },
          { name: 'support', type: 'bool' }
        ]
      };

      it('reverts if the signatory is invalid', async () => {
        const badBytes = '0x6c00000000000000000000000000000000000000000000000000000000000000';
        await expectRevert(
          gov.castVoteBySig(proposalId, false, 0, badBytes, badBytes),
          "revert GovernorAlpha::castVoteBySig: invalid signature"
        );
      });

      it('casts vote on behalf of the signatory', async () => {
        await enfranchise(govToken, a1, 400001);
        await gov.connect(a1).propose(targets, values, signatures, callDatas, "do nothing");
        proposalId = await gov.latestProposalIds(a1.address);

        const { v, r, s } = await signMessage(a1, Domain(gov), Types, { proposalId, support: true });

        let beforeFors = (await gov.proposals(proposalId)).forVotes;
        await mineBlock();
        const tx = await complete(gov.castVoteBySig(proposalId, true, v, r, s));
        expect(tx.gasUsed.toNumber()).lessThan(100000);

        let afterFors = (await gov.proposals(proposalId)).forVotes;
        expect(afterFors).equal(beforeFors.add(etherMantissa(400001).toString()));
      });
    });
  });
});