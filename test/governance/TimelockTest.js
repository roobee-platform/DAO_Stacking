const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { encodeParameters, address, complete, getBlockTimestamp, increaseTime, mineBlock } = require('./../utils/Utils'); 

const oneWeekInSeconds = 7 * 24 * 60 * 60;
const zero = 0;
const gracePeriod = oneWeekInSeconds * 2;

describe('Timelock', () => {
  let root, notAdmin, newAdmin;
  let blockTimestamp;
  let timelock;
  let delay = oneWeekInSeconds;
  let newDelay = delay * 2;
  let target = address(0);
  let value = 0;
  let signature = 'setDelay(uint256)';
  let data = encodeParameters(['uint256'], [newDelay]);
  let revertData = encodeParameters(['uint256'], [60 * 60]);
  let eta = 0;
  let queuedTxHash;

  beforeEach(async () => {
    [root, notAdmin, newAdmin] = await hre.waffle.provider.getWallets();

    const TimelockHarness = await ethers.getContractFactory("TimelockHarness");

    timelock = await TimelockHarness.deploy(root.address, delay);

    target = timelock.address;
    
    queuedTxHash = async (setDelay) => {
      blockTimestamp = await getBlockTimestamp();
      let txEta;
      if (!setDelay) {
        txEta = blockTimestamp + delay;
      } else {
        txEta = blockTimestamp + setDelay;
      }
      return ethers.utils.keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value, signature, data, txEta]
        )
      );
    };
  });

  describe('constructor', () => {
    it('sets address of admin', async () => {
      expect(await timelock.admin()).equal(root.address);
    });

    it('sets delay', async () => {
      expect(await timelock.delay()).equal(delay);
    });
  });

  describe('setDelay', () => {
    it('requires msg.sender to be Timelock', async () => {
      await expectRevert(
        timelock.setDelay(delay),
        'revert Timelock::setDelay: Call must come from Timelock.'
      );
    });
  });

  describe('setPendingAdmin', () => {
    it('requires msg.sender to be Timelock', async () => {
      await expectRevert(
        timelock.setPendingAdmin(newAdmin.address),
        'revert Timelock::setPendingAdmin: Call must come from Timelock.'
      );
    });
  });

  describe('acceptAdmin', () => {
    afterEach(async () => {
      await timelock.harnessSetAdmin(root.address);
    });

    it('requires msg.sender to be pendingAdmin', async () => {
      await expectRevert(
        timelock.connect(notAdmin).acceptAdmin(),
        'revert Timelock::acceptAdmin: Call must come from pendingAdmin.'
      )
    });

    it('sets pendingAdmin to address 0 and changes admin', async () => {
      await timelock.harnessSetPendingAdmin(newAdmin.address);
      expect(await timelock.pendingAdmin()).equal(newAdmin.address);

      const tx = await complete(timelock.connect(newAdmin).acceptAdmin());
      expect(await timelock.pendingAdmin()).equal(address(0));
      expect(await timelock.admin()).equal(newAdmin.address);

      expect(tx.events[0].event).equal('NewAdmin');
    });
  });

  describe('queueTransaction', () => {
    it('requires admin to be msg.sender', async () => {
      blockTimestamp = await getBlockTimestamp();
      await expectRevert(
        timelock.connect(notAdmin).queueTransaction(target, value, signature, data, blockTimestamp + delay),
        'revert Timelock::queueTransaction: Call must come from admin.'
      );
    });

    it('requires eta to exceed delay', async () => {
      blockTimestamp = await getBlockTimestamp();
      const etaLessThanDelay = blockTimestamp + delay - 1;

      await expectRevert(
        timelock.queueTransaction(target, value, signature, data, etaLessThanDelay),
        'revert Timelock::queueTransaction: Estimated execution block must satisfy delay.'
      );
    });

    it('sets hash as true in queuedTransactions mapping', async () => {
      const queueTransactionsHashValueBefore = await timelock.queuedTransactions(await queuedTxHash());
      expect(queueTransactionsHashValueBefore).equal(false);

      blockTimestamp = await getBlockTimestamp();
      await timelock.queueTransaction(target, value, signature, data, blockTimestamp + delay + 1);

      const queueTransactionsHashValueAfter = await timelock.queuedTransactions(await queuedTxHash());
      expect(queueTransactionsHashValueAfter).equal(true);
    });

    it('should emit QueueTransaction event', async () => {
      blockTimestamp = await getBlockTimestamp();
      const tx = await complete(timelock.queueTransaction(target, value, signature, data, blockTimestamp + delay + 1));
      expect(tx.events[0].event).equal('QueueTransaction');
    });
  });

  describe('cancelTransaction', () => {
    beforeEach(async () => {
      blockTimestamp = await getBlockTimestamp();
      await complete(timelock.queueTransaction(target, value, signature, data, blockTimestamp + delay + 1));
    });

    it('requires admin to be msg.sender', async () => {
      expectRevert(
        timelock.connect(notAdmin).cancelTransaction(target, value, signature, data, eta),
        'revert Timelock::cancelTransaction: Call must come from admin.'
      );
    });

    it('sets hash from true to false in queuedTransactions mapping', async () => {
      const queueTransactionsHashValueBefore = await timelock.queuedTransactions(await queuedTxHash());
      expect(queueTransactionsHashValueBefore).equal(true);

      blockTimestamp = await getBlockTimestamp();
      await timelock.cancelTransaction(target, value, signature, data, blockTimestamp + delay + 1);

      const queueTransactionsHashValueAfter = await timelock.queuedTransactions(await queuedTxHash());
      expect(queueTransactionsHashValueAfter).equal(false);
    });

    it('should emit CancelTransaction event', async () => {
      const result = await complete(timelock.cancelTransaction(target, value, signature, data, eta));
      expect(result.events[0].event).equal('CancelTransaction');
    });
  });

  describe('queue and cancel empty', () => {
    it('can queue and cancel an empty signature and data', async () => {
      blockTimestamp = await getBlockTimestamp();
      eta = blockTimestamp + delay + 1;
      const txHash = ethers.utils.keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value, '', '0x', eta]
        )
      );
      
      expect(await timelock.queuedTransactions(txHash)).equal(false);
      await timelock.queueTransaction(target, value, '', '0x', eta);
      expect(await timelock.queuedTransactions(txHash)).equal(true);
      await timelock.cancelTransaction(target, value, '', '0x', eta);
      expect(await timelock.queuedTransactions(txHash)).equal(false);
    });
  });

  describe('executeTransaction (setDelay)', () => {
    let firstEta, txHash;

    beforeEach(async () => {
      // Queue transaction that will succeed
      txHash = await queuedTxHash(delay + 1);
      //blockTimestamp = await getBlockTimestamp();
      firstEta = blockTimestamp + delay + 1;
      await timelock.queueTransaction(target, value, signature, data, firstEta);

      // Queue transaction that will revert when executed
      blockTimestamp = await getBlockTimestamp();
      eta = blockTimestamp + delay + 1;
      await timelock.queueTransaction(target, value, signature, revertData, eta);
    });

    it('requires admin to be msg.sender', async () => {
      await expectRevert(
        timelock.connect(notAdmin).executeTransaction(target, value, signature, data, eta),
        'revert Timelock::executeTransaction: Call must come from admin.'
      );
    });

    it('requires transaction to be queued', async () => {
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta + 1),
        "revert Timelock::executeTransaction: Transaction hasn't been queued."
      );      
    });

    it('requires timestamp to be greater than or equal to eta', async () => {
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, firstEta),
        "revert Timelock::executeTransaction: Transaction hasn't surpassed time lock."
      ); 
    });

    it('requires timestamp to be less than eta plus gracePeriod', async () => {
      increaseTime(delay + gracePeriod + 1);

      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, firstEta),
        'revert Timelock::executeTransaction: Transaction is stale.'
      );
    });

    it('requires target.call transaction to succeed', async () => {
      blockTimestamp = await getBlockTimestamp();
      increaseTime(eta - blockTimestamp);

      await expectRevert(
        timelock.executeTransaction(target, value, signature, revertData, eta),
        'revert Timelock::executeTransaction: Transaction execution reverted.'
      );
    });

    it('sets hash from true to false in queuedTransactions mapping, updates delay, and emits ExecuteTransaction event', async () => {
      expect(await timelock.delay()).equal(delay);
      expect(await timelock.queuedTransactions(txHash)).equal(true);

      await increaseTime(delay + 1);
      const result = await complete(timelock.executeTransaction(target, value, signature, data, firstEta));

      expect(await timelock.queuedTransactions(txHash)).equal(false);
      expect(await timelock.delay()).equal(newDelay);

      expect(result.events[0].event).equal('NewDelay');
      expect(result.events[1].event).equal('ExecuteTransaction');
    });
  });

  describe('executeTransaction (setPendingAdmin)', () => {
    beforeEach(async () => {
      blockTimestamp = await getBlockTimestamp();

      signature = 'setPendingAdmin(address)';
      data = encodeParameters(['address'], [newAdmin.address]);
      eta = blockTimestamp + delay + 1;

      queuedTxHash = ethers.utils.keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), signature, data, eta.toString()]
        )
      );

      await timelock.queueTransaction(target, value, signature, data, eta);
    });

    it('requires admin to be msg.sender', async () => {
      await expectRevert(
        timelock.connect(notAdmin).executeTransaction(target, value, signature, data, eta),
        'revert Timelock::executeTransaction: Call must come from admin.'
      );
    });

    it('requires transaction to be queued', async () => {
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta + 1),
        "revert Timelock::executeTransaction: Transaction hasn't been queued."
      )      
    });

    it('requires timestamp to be greater than or equal to eta', async () => {
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta),
        "revert Timelock::executeTransaction: Transaction hasn't surpassed time lock."
      );
    });

    it('requires timestamp to be less than eta plus gracePeriod', async () => {
      await increaseTime(delay + gracePeriod + 1);

      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta),
        'revert Timelock::executeTransaction: Transaction is stale.'
      );
    });

    it('sets hash from true to false in queuedTransactions mapping, updates admin, and emits ExecuteTransaction event', async () => {
      const configuredPendingAdminBefore = await timelock.pendingAdmin();
      expect(configuredPendingAdminBefore).equal(address(0));

      const queueTransactionsHashValueBefore = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueBefore).equal(true);

      const newTimestamp = blockTimestamp + delay + 1;
      const currentTimestamp = await getBlockTimestamp();
      await increaseTime(newTimestamp - currentTimestamp);

      const result = await complete(timelock.executeTransaction(target, value, signature, data, eta));

      expect(await timelock.queuedTransactions(queuedTxHash)).equal(false);
      expect(await timelock.pendingAdmin()).equal(newAdmin.address);

      expect(result.events[0].event).equal('NewPendingAdmin');
      expect(result.events[1].event).equal('ExecuteTransaction');
    });
  });
});
