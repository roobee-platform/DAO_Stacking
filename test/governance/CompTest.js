const { expect } = require("chai");
const { expectRevert } = require('@openzeppelin/test-helpers');

const { address, signMessage, mineBlock, complete, stopMining, startMining } = require('../utils/Utils');

describe('Comp', () => {
  const name = 'Compound';
  const symbol = 'COMP';

  let root, a1, a2, accounts, chainId;
  let comp;

  beforeEach(async () => {
    [root, a1, a2, ...accounts] = await hre.waffle.provider.getWallets();
    let Comp = await ethers.getContractFactory("Comp");
    chainId = hre.network.config.chainId;
    comp = await Comp.deploy(root.address);
  });

  describe('metadata', () => {
    it('has given name', async () => {
      expect(await comp.name()).equal(name);
    });

    it('has given symbol', async () => {
      expect(await comp.symbol()).equal(symbol);
    });
  });

  describe('balanceOf', () => {
    it('grants to initial account', async () => {
      expect(await comp.balanceOf(root.address)).equal("10000000000000000000000000");
    });
  });

  describe('delegateBySig', () => {
    const Domain = (comp) => ({ name, chainId, verifyingContract: comp.address });
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
        comp.delegateBySig(delegatee.address, nonce, expiry, 0, badBytes, badBytes),
        'revert Comp::delegateBySig: invalid signature'
      )
    });

    it('reverts if the nonce is bad ', async () => {
      const delegatee = root, nonce = 1, expiry = 0;
      const { v, r, s } = await signMessage(a1, Domain(comp), Types, { delegatee: delegatee.address, nonce: nonce, expiry: expiry });

      await expectRevert(
        comp.delegateBySig(delegatee.address, nonce, expiry, v, r, s),
        "revert Comp::delegateBySig: invalid nonce"
      )
    });

    it('reverts if the signature has expired', async () => {
      const delegatee = root, nonce = 0, expiry = 0;
      const { v, r, s } = await signMessage(a1, Domain(comp), Types, { delegatee: delegatee.address, nonce: nonce, expiry: expiry });
      
      await expectRevert(
        comp.delegateBySig(delegatee.address, nonce, expiry, v, r, s),
        "revert Comp::delegateBySig: signature expired"
      )
    });

    it('delegates on behalf of the signatory', async () => {
      const delegatee = root, nonce = 0, expiry = 10e9;
      const { v, r, s } = await signMessage(a1, Domain(comp), Types, { delegatee: delegatee.address, nonce: nonce, expiry: expiry });

      expect(await comp.delegates(a1.address)).equal(address(0));
      
      const tx = await comp.delegateBySig(delegatee.address, nonce, expiry, v, r, s);
      expect(tx.gasUsed < 80000);
      expect(await comp.delegates(a1.address)).equal(root.address);
    });
  });

  describe('numCheckpoints', () => {
    it('returns the number of checkpoints for a delegate', async () => {
      let guy = accounts[0];

      await complete(comp.transfer(guy.address, 100));
      expect(await comp.numCheckpoints(a1.address)).equals(0);

      const t1 = await complete(comp.connect(guy).delegate(a1.address));
      expect(await comp.numCheckpoints(a1.address)).equal(1);

      const t2 = await (await comp.connect(guy).transfer(a2.address, 10)).wait();
      expect(await comp.numCheckpoints(a1.address)).equal(2);

      const t3 = await (await comp.connect(guy).transfer(a2.address, 10)).wait();
      expect(await comp.numCheckpoints(a1.address)).equal(3);

      const t4 = await (await comp.connect(root).transfer(guy.address, 20)).wait();
      expect(await comp.numCheckpoints(a1.address)).equal(4);

      [fromBlock, votes] = await comp.checkpoints(a1.address, 0);
      expect(fromBlock).equal(t1.blockNumber);
      expect(votes).equal(100);

      [fromBlock, votes] = await comp.checkpoints(a1.address, 1);
      expect(fromBlock).equal(t2.blockNumber);
      expect(votes).equal(90);

      [fromBlock, votes] = await comp.checkpoints(a1.address, 2);
      expect(fromBlock).equal(t3.blockNumber);
      expect(votes).equal(80);

      [fromBlock, votes] = await comp.checkpoints(a1.address, 3);
      expect(fromBlock).equal(t4.blockNumber);
      expect(votes).equal(100);
    });

    it('does not add more than one checkpoint in a block', async () => {
      let guy = accounts[0];

      await comp.transfer(guy.address, 100);
      expect(await comp.numCheckpoints(a1.address)).equal(0);

      await stopMining();

      let t1 = await comp.connect(guy).delegate(a1.address);
      let t2 = await comp.connect(guy).transfer(a2.address, 10);
      let t3 = await comp.connect(guy).transfer(a2.address, 10);

      await startMining();

      t1 = await t1.wait();
      t2 = await t2.wait();
      t3 = await t3.wait();

      expect(await comp.numCheckpoints(a1.address)).equal(1);
      
      [fromBlock, votes] = await comp.checkpoints(a1.address, 0);
      expect(fromBlock).equal(t1.blockNumber);
      expect(votes).equal(80);

      [fromBlock, votes] = await comp.checkpoints(a1.address, 1);
      expect(fromBlock).equal(0);
      expect(votes).equal(0);

      [fromBlock, votes] = await comp.checkpoints(a1.address, 2);
      expect(fromBlock).equal(0);
      expect(votes).equal(0);

      const t4 = await (await comp.connect(root).transfer(guy.address, 20)).wait();
      expect(await comp.numCheckpoints(a1.address)).equal(2);
      [fromBlock, votes] = await comp.checkpoints(a1.address, 1);
      expect(fromBlock).equal(t4.blockNumber);
      expect(votes).equal(100);
    });
  });

  describe('getPriorVotes', () => {
    it('reverts if block number >= current block', async () => {
      expectRevert(
        comp.getPriorVotes(a1.address, 5e10),
        "revert Comp::getPriorVotes: not yet determined"
      )
    });

    it('returns 0 if there are no checkpoints', async () => {
      expect(await comp.getPriorVotes(a1.address, 0)).equal(0);
    });

    it('returns the latest block if >= last checkpoint block', async () => {
      const t1 = await (await comp.connect(root).delegate(a1.address)).wait();
      //await ethers.provider.send('evm_mine', []);
      //await ethers.provider.send('evm_mine', []);
      await mineBlock(2);

      expect(await comp.getPriorVotes(a1.address, t1.blockNumber)).equal('10000000000000000000000000');
      expect(await comp.getPriorVotes(a1.address, t1.blockNumber + 1)).equal('10000000000000000000000000');
    });

    it('returns zero if < first checkpoint block', async () => {
      await ethers.provider.send('evm_mine', []);
      const t1 = await (await comp.connect(root).delegate(a1.address)).wait()
      await ethers.provider.send('evm_mine', []);
      await ethers.provider.send('evm_mine', []);

      expect(await comp.getPriorVotes(a1.address, t1.blockNumber - 1)).equal('0');
      expect(await comp.getPriorVotes(a1.address, t1.blockNumber + 1)).equal('10000000000000000000000000');
    });

    it('generally returns the voting balance at the appropriate checkpoint', async () => {
      const t1 = await (await comp.connect(root).delegate(a1.address)).wait();
      await ethers.provider.send('evm_mine', []);
      await ethers.provider.send('evm_mine', []);

      const t2 = await (await comp.connect(root).transfer(a2.address, 10)).wait();
      await ethers.provider.send('evm_mine', []);
      await ethers.provider.send('evm_mine', []);

      const t3 = await (await comp.connect(root).transfer(a2.address, 10)).wait();
      await ethers.provider.send('evm_mine', []);
      await ethers.provider.send('evm_mine', []);

      const t4 = await (await comp.connect(a2).transfer(root.address, 20)).wait();
      await ethers.provider.send('evm_mine', []);
      await ethers.provider.send('evm_mine', []);

      expect(await comp.getPriorVotes(a1.address, t1.blockNumber - 1)).equal('0');
      expect(await comp.getPriorVotes(a1.address, t1.blockNumber)).equal('10000000000000000000000000');
      expect(await comp.getPriorVotes(a1.address, t1.blockNumber)).equal('10000000000000000000000000');

      expect(await comp.getPriorVotes(a1.address, t2.blockNumber)).equal('9999999999999999999999990');
      expect(await comp.getPriorVotes(a1.address, t2.blockNumber + 1)).equal('9999999999999999999999990');

      expect(await comp.getPriorVotes(a1.address, t3.blockNumber)).equal('9999999999999999999999980');
      expect(await comp.getPriorVotes(a1.address, t3.blockNumber + 1)).equal('9999999999999999999999980');

      expect(await comp.getPriorVotes(a1.address, t4.blockNumber)).equal('10000000000000000000000000');
      expect(await comp.getPriorVotes(a1.address, t4.blockNumber + 1)).equal('10000000000000000000000000');
    });
  });
});
