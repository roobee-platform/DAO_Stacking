const { expect } = require("chai");
const { expectRevert } = require('@openzeppelin/test-helpers');

const {
  address, 
  signMessage, 
  mineBlock,
  complete, 
  stopMining,
  startMining,
  expectObject
} = require('../utils/Utils');

describe('Governance Token', () => {
  const name = 'RoobeeGovernance';
  const symbol = 'gROOBEE';

  let root, a1, accounts, chainId;
  let govToken;

  beforeEach(async () => {
    [root, a1, ...accounts] = await hre.waffle.provider.getWallets();
    let GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    chainId = hre.network.config.chainId;
    govToken = await GovernanceToken.deploy(root.address);
    await govToken.mint(root.address, "10000000000000000000000000");
  });

  describe('metadata', () => {
    it('has given name', async () => {
      expect(await govToken.name()).equal(name);
    });

    it('has given symbol', async () => {
      expect(await govToken.symbol()).equal(symbol);
    });
  });

  describe('balanceOf', () => {
    it('grants to initial account', async () => {
      expect(await govToken.balanceOf(root.address)).equal("10000000000000000000000000");
    });
  });

  describe('delegateBySig', () => {
    const Domain = (govToken) => ({ name, chainId, verifyingContract: govToken.address });
    const Types = {
      Delegation: [
        { name: 'delegatee', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expiry', type: 'uint256' }
      ]
    };

    it('reverts if the signatory is invalid', async () => {
      const badBytes = '0x6c00000000000000000000000000000000000000000000000000000000000000';
      const delegatee = root, nonce = 0, expiry = 0;
      await expectRevert(
        govToken.delegateBySig(delegatee.address, nonce, expiry, 0, badBytes, badBytes),
        'revert Roobee::delegateBySig: invalid signature'
      )
    });

    it('reverts if the nonce is bad ', async () => {
      const delegatee = root, nonce = 1, expiry = 0;
      const { v, r, s } = await signMessage(a1, Domain(govToken), Types, { delegatee: delegatee.address, nonce: nonce, expiry: expiry });

      await expectRevert(
        govToken.delegateBySig(delegatee.address, nonce, expiry, v, r, s),
        "revert Roobee::delegateBySig: invalid nonce"
      )
    });

    it('reverts if the signature has expired', async () => {
      const delegatee = root, nonce = 0, expiry = 0;
      const { v, r, s } = await signMessage(a1, Domain(govToken), Types, { delegatee: delegatee.address, nonce: nonce, expiry: expiry });
      
      await expectRevert(
        govToken.delegateBySig(delegatee.address, nonce, expiry, v, r, s),
        "revert Roobee::delegateBySig: signature expired"
      )
    });

    it('delegates on behalf of the signatory', async () => {
      const delegatee = root, nonce = 0, expiry = 10e9;
      const { v, r, s } = await signMessage(a1, Domain(govToken), Types, { delegatee: delegatee.address, nonce: nonce, expiry: expiry });

      expect(await govToken.delegates(a1.address)).equal(address(0));
      
      const tx = await complete(govToken.delegateBySig(delegatee.address, nonce, expiry, v, r, s));
      expect(tx.gasUsed.toNumber()).lessThan(100000);
      expect(await govToken.delegates(a1.address)).equal(root.address);
    });
  });

  describe('numCheckpoints', () => {
    it('returns the number of checkpoints for a delegate', async () => {
      let guy = accounts[0];

      await complete(govToken.mint(guy.address, 100));
      expect(await govToken.numCheckpoints(a1.address)).equals(0);

      const t1 = await complete(govToken.connect(guy).delegate(a1.address));
      expect(await govToken.numCheckpoints(a1.address)).equal(1);

      const t2 = await complete(govToken.burn(guy.address, 10))
      expect(await govToken.numCheckpoints(a1.address)).equal(2);

      const t3 = await complete(govToken.burn(guy.address, 10));
      expect(await govToken.numCheckpoints(a1.address)).equal(3);

      const t4 = await complete(govToken.mint(guy.address, 20));
      expect(await govToken.numCheckpoints(a1.address)).equal(4);

      expectObject(await govToken.checkpoints(a1.address, 0), {fromBlock: t1.blockNumber, votes: 100});
      expectObject(await govToken.checkpoints(a1.address, 1), {fromBlock: t2.blockNumber, votes: 90});
      expectObject(await govToken.checkpoints(a1.address, 2), {fromBlock: t3.blockNumber, votes: 80});
      expectObject(await govToken.checkpoints(a1.address, 3), {fromBlock: t4.blockNumber, votes: 100});
    });

    it('does not add more than one checkpoint in a block', async () => {
      let guy = accounts[0];

      await govToken.mint(guy.address, 100);
      expect(await govToken.numCheckpoints(a1.address)).equal(0);

      await stopMining();

      let t1 = await govToken.connect(guy).delegate(a1.address);
      let t2 = await govToken.burn(guy.address, 10);
      let t3 = await govToken.burn(guy.address, 10);

      await startMining();

      t1 = await t1.wait();
      t2 = await t2.wait();
      t3 = await t3.wait();

      expect(await govToken.numCheckpoints(a1.address)).equal(1);

      expectObject(await govToken.checkpoints(a1.address, 0), {fromBlock: t1.blockNumber, votes: 80});
      expectObject(await govToken.checkpoints(a1.address, 1), {fromBlock: 0, votes: 0});
      expectObject(await govToken.checkpoints(a1.address, 2), {fromBlock: 0, votes: 0});

      const t4 = await complete(govToken.mint(guy.address, 20));
      expect(await govToken.numCheckpoints(a1.address)).equal(2);
      expectObject(await govToken.checkpoints(a1.address, 1), {fromBlock: t4.blockNumber, votes: 100});
    });
  });

  describe('getPriorVotes', () => {
    it('reverts if block number >= current block', async () => {
      expectRevert(
        govToken.getPriorVotes(a1.address, 5e10),
        "revert Roobee::getPriorVotes: not yet determined"
      )
    });

    it('returns 0 if there are no checkpoints', async () => {
      expect(await govToken.getPriorVotes(a1.address, 0)).equal(0);
    });

    it('returns the latest block if >= last checkpoint block', async () => {
      const t1 = await complete(govToken.connect(root).delegate(a1.address));
      await mineBlock(2);

      expect(await govToken.getPriorVotes(a1.address, t1.blockNumber)).equal('10000000000000000000000000');
      expect(await govToken.getPriorVotes(a1.address, t1.blockNumber + 1)).equal('10000000000000000000000000');
    });

    it('returns zero if < first checkpoint block', async () => {
      mineBlock();
      const t1 = await (await govToken.connect(root).delegate(a1.address)).wait()
      mineBlock(2);

      expect(await govToken.getPriorVotes(a1.address, t1.blockNumber - 1)).equal('0');
      expect(await govToken.getPriorVotes(a1.address, t1.blockNumber + 1)).equal('10000000000000000000000000');
    });

    it('generally returns the voting balance at the appropriate checkpoint', async () => {
      const t1 = await (await govToken.connect(root).delegate(a1.address)).wait();
      mineBlock(2);

      const t2 = await (await govToken.burn(root.address, 10)).wait();
      mineBlock(2);

      const t3 = await (await govToken.burn(root.address, 10)).wait();
      mineBlock(2);

      const t4 = await (await govToken.mint(root.address, 20)).wait();
      mineBlock(2);

      expect(await govToken.getPriorVotes(a1.address, t1.blockNumber - 1)).equal('0');
      expect(await govToken.getPriorVotes(a1.address, t1.blockNumber)).equal('10000000000000000000000000');
      expect(await govToken.getPriorVotes(a1.address, t1.blockNumber)).equal('10000000000000000000000000');

      expect(await govToken.getPriorVotes(a1.address, t2.blockNumber)).equal('9999999999999999999999990');
      expect(await govToken.getPriorVotes(a1.address, t2.blockNumber + 1)).equal('9999999999999999999999990');

      expect(await govToken.getPriorVotes(a1.address, t3.blockNumber)).equal('9999999999999999999999980');
      expect(await govToken.getPriorVotes(a1.address, t3.blockNumber + 1)).equal('9999999999999999999999980');

      expect(await govToken.getPriorVotes(a1.address, t4.blockNumber)).equal('10000000000000000000000000');
      expect(await govToken.getPriorVotes(a1.address, t4.blockNumber + 1)).equal('10000000000000000000000000');
    });
  });
});
