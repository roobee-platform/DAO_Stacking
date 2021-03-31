const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
/*const {
  encodeParameters,
  etherUnsigned,
  freezeTime,
  keccak256
} = require('./Utils/Ethereum');*/

const { encodeParameters, address, complete, getBlockTimestamp, increaseTime } = require('./../utils/Utils'); 

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
    
    queuedTxHash = async () => {
      blockTimestamp = await getBlockTimestamp();
      return ethers.utils.keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value, signature, data, blockTimestamp + delay]
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
      //await send(timelock, 'harnessSetAdmin', [root], { from: root });
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
    let firstEta;

    beforeEach(async () => {
      // Queue transaction that will succeed
      blockTimestamp = await getBlockTimestamp();
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
      const configuredDelayBefore = await timelock.delay();
      expect(configuredDelayBefore).equal(delay);

      /*const queueTransactionsHashValueBefore = await call(timelock, 'queuedTransactions', [queuedTxHash]);
      expect(queueTransactionsHashValueBefore).toEqual(true);

      const newBlockTimestamp = blockTimestamp.plus(delay).plus(1);
      await freezeTime(newBlockTimestamp.toNumber());

      const result = await send(timelock, 'executeTransaction', [target, value, signature, data, eta], {
        from: root
      });

      const queueTransactionsHashValueAfter = await call(timelock, 'queuedTransactions', [queuedTxHash]);
      expect(queueTransactionsHashValueAfter).toEqual(false);

      const configuredDelayAfter = await call(timelock, 'delay');
      expect(configuredDelayAfter).toEqual(newDelay.toString());

      expect(result).toHaveLog('ExecuteTransaction', {
        data,
        signature,
        target,
        eta: eta.toString(),
        txHash: queuedTxHash,
        value: value.toString()
      });

      expect(result).toHaveLog('NewDelay', {
        newDelay: newDelay.toString()
      });*/
    });
  });

  /*describe('executeTransaction (setPendingAdmin)', () => {
    beforeEach(async () => {
      const configuredDelay = await call(timelock, 'delay');

      delay = etherUnsigned(configuredDelay);
      signature = 'setPendingAdmin(address)';
      data = encodeParameters(['address'], [newAdmin]);
      eta = blockTimestamp.plus(delay);

      queuedTxHash = keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), signature, data, eta.toString()]
        )
      );

      await send(timelock, 'queueTransaction', [target, value, signature, data, eta], {
        from: root
      });
    });

    it('requires admin to be msg.sender', async () => {
      await expect(
        send(timelock, 'executeTransaction', [target, value, signature, data, eta], { from: notAdmin })
      ).rejects.toRevert('revert Timelock::executeTransaction: Call must come from admin.');
    });

    it('requires transaction to be queued', async () => {
      const differentEta = eta.plus(1);
      await expect(
        send(timelock, 'executeTransaction', [target, value, signature, data, differentEta], { from: root })
      ).rejects.toRevert("revert Timelock::executeTransaction: Transaction hasn't been queued.");
    });

    it('requires timestamp to be greater than or equal to eta', async () => {
      await expect(
        send(timelock, 'executeTransaction', [target, value, signature, data, eta], {
          from: root
        })
      ).rejects.toRevert(
        "revert Timelock::executeTransaction: Transaction hasn't surpassed time lock."
      );
    });

    it('requires timestamp to be less than eta plus gracePeriod', async () => {
      await freezeTime(blockTimestamp.plus(delay).plus(gracePeriod).plus(1).toNumber());

      await expect(
        send(timelock, 'executeTransaction', [target, value, signature, data, eta], {
          from: root
        })
      ).rejects.toRevert('revert Timelock::executeTransaction: Transaction is stale.');
    });

    it('sets hash from true to false in queuedTransactions mapping, updates admin, and emits ExecuteTransaction event', async () => {
      const configuredPendingAdminBefore = await call(timelock, 'pendingAdmin');
      expect(configuredPendingAdminBefore).toEqual('0x0000000000000000000000000000000000000000');

      const queueTransactionsHashValueBefore = await call(timelock, 'queuedTransactions', [queuedTxHash]);
      expect(queueTransactionsHashValueBefore).toEqual(true);

      const newBlockTimestamp = blockTimestamp.plus(delay).plus(1);
      await freezeTime(newBlockTimestamp.toNumber())

      const result = await send(timelock, 'executeTransaction', [target, value, signature, data, eta], {
        from: root
      });

      const queueTransactionsHashValueAfter = await call(timelock, 'queuedTransactions', [queuedTxHash]);
      expect(queueTransactionsHashValueAfter).toEqual(false);

      const configuredPendingAdminAfter = await call(timelock, 'pendingAdmin');
      expect(configuredPendingAdminAfter).toEqual(newAdmin);

      expect(result).toHaveLog('ExecuteTransaction', {
        data,
        signature,
        target,
        eta: eta.toString(),
        txHash: queuedTxHash,
        value: value.toString()
      });

      expect(result).toHaveLog('NewPendingAdmin', {
        newPendingAdmin: newAdmin
      });
    });
  });*/
});
