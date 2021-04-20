pragma solidity ^0.7.3;
pragma experimental ABIEncoderV2;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/ITokenManager.sol";


contract DAOStacking is ReentrancyGuardUpgradeable, OwnableUpgradeable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    ITokenManager public tokenManager;
    IERC20 public rewardsToken;
    IERC20 public stakingToken;
    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public rewardsDuration;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public exchangeRate;
    uint256 public maxLocks;
    bool private initialised;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping (address => uint256) private _unlockedBalances;
    mapping(address => Lock[]) private addressStakeLocks;

    struct Lock {
        uint endTimestamp;
        uint amount;
    }

    /* ========== CONSTRUCTOR ========== */

    function init(
        address _rewardsToken,
        address _stakingToken,
        address _tokenManager,
        uint256 _rewardsDuration,
        uint256 _exchangeRate,
        uint256 _maxLocks
    ) external   {
        __Ownable_init();
        require(!initialised, "Already initialised");
        rewardsToken = IERC20(_rewardsToken);
        stakingToken = IERC20(_stakingToken);
        tokenManager = ITokenManager(_tokenManager);
        rewardsDuration = _rewardsDuration;
        exchangeRate = _exchangeRate;
        maxLocks = _maxLocks;
        initialised = true;
    }

    /* ========== VIEWS ========== */

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }


    function unlockedBalanceOf(address account) external view returns (uint256) {
        return _unlockedBalances[account];
    }

    function lockedBalanceOf(address account) external view returns (Lock[] memory) {
        return addressStakeLocks[account];
    }


    function lastTimeRewardApplicable() public view returns (uint256) {
        return min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return
        rewardPerTokenStored.add(
            lastTimeRewardApplicable()
            .sub(lastUpdateTime)
            .mul(rewardRate)
            .mul(1e18)
            .div(_totalSupply)
        );
    }

    function earned(address account) public view returns (uint256) {
        return
        _balances[account]
        .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
        .div(1e18)
        .add(rewards[account]);
    }

    function getRewardForDuration() external view returns (uint256) {
        return rewardRate.mul(rewardsDuration);
    }

    function min(uint256 a, uint256 b) public pure returns (uint256) {
        return a < b ? a : b;
    }

    /* ========== HELPER FUNCTIONS ========== */


    /**
     * @notice Check if a Lock is empty
     * @param _lock lock
     */
    function isLockEmpty(Lock memory _lock) public pure returns (bool) {
        return _lock.endTimestamp == 0 && _lock.amount == 0;
    }

    /**
     * @notice Returns the position in which it's possible to insert a new Lock within addressStakeLocks
     * @param _address address
     */
    function _getEmptyLockIndexForAddress(address _address) internal view returns (uint256, uint256) {
        Lock[] storage stakedLocks = addressStakeLocks[_address];
        uint256 numberOfStakeLocks = stakedLocks.length;
        if (numberOfStakeLocks < maxLocks) {
            return (maxLocks.add(1), numberOfStakeLocks);
        } else {
            for (uint256 i = 0; i < numberOfStakeLocks; i++) {
                if (isLockEmpty(stakedLocks[i])) {
                    return (i, numberOfStakeLocks);
                }
            }
            revert("ERROR_IMPOSSIBLE_TO_INSERT");
        }
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function deposit(uint256 _amount, bool _annual, address _receiver)
    external
    nonReentrant
    {
        require(_amount > 0, "Cannot stake 0");
        if (_annual) {
            (uint256 emptyIndex, uint256 totalNumberOfStakedLocks) = _getEmptyLockIndexForAddress(_receiver);
            uint256 endTimestamp = block.timestamp.add(365 days);
            if (emptyIndex < totalNumberOfStakedLocks) {
                addressStakeLocks[_receiver][emptyIndex] = Lock(endTimestamp, _amount);
            } else {
                addressStakeLocks[_receiver].push(Lock(endTimestamp, _amount));
            }
        }
        else {
            _unlockedBalances[_receiver] = _unlockedBalances[_receiver].add(_amount);
        }
        updateReward(_receiver);
        _totalSupply = _totalSupply.add(_amount);
        _balances[msg.sender] = _balances[msg.sender].add(_amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        uint gTokensAmountToMint = _amount.div(exchangeRate);
        tokenManager.mint(_receiver, uint96(gTokensAmountToMint));
        emit Staked(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Cannot withdraw 0");
        _getReward();
        _unlockedBalances[msg.sender] = _unlockedBalances[msg.sender].sub(_amount);
        _totalSupply = _totalSupply.sub(_amount);
        _balances[msg.sender] = _balances[msg.sender].sub(_amount);
        stakingToken.safeTransfer(msg.sender, _amount);
        uint gTokensAmountToBurn = _amount.div(exchangeRate);
        tokenManager.burn(msg.sender, uint96(gTokensAmountToBurn));
        emit Withdrawn(msg.sender, _amount);

    }

    function unlock(uint256 _amount) external nonReentrant
    {
        require(_amount > 0, "Cannot unlock 0");
        _getReward();
        require(_updateStakedTokenLocks(msg.sender, _amount), "ERROR_NOT_ENOUGH_TOKENS_TO_UNLOCK");
        _totalSupply = _totalSupply.sub(_amount);
        _balances[msg.sender] = _balances[msg.sender].sub(_amount);
        stakingToken.safeTransfer(msg.sender, _amount);
        emit Unlocked(msg.sender, _amount);
    }


    /**
     * @notice Check if it's possible to unwrap the specified _amountToUnstake of token and updates (or deletes) related stakedLocks
     * @param _unwrapper address who want to unwrap
     * @param _amountToUnstake amount
     */
    function _updateStakedTokenLocks(address _unwrapper, uint256 _amountToUnstake) internal returns (bool) {
        Lock[] storage stakedLocks = addressStakeLocks[_unwrapper];
        uint256 totalAmountUnstakedSoFar = 0;
        uint256 stakedLocksLength = stakedLocks.length;
        uint[] memory locksToRemove = new uint[](stakedLocksLength);
        uint currentIndexOfLocksToBeRemoved = 0;

        bool result = false;
        uint i = 0;
        for (; i < stakedLocksLength; i++) {
            if (block.timestamp >= stakedLocks[i].endTimestamp && !isLockEmpty(stakedLocks[i])) {
                totalAmountUnstakedSoFar = totalAmountUnstakedSoFar.add(stakedLocks[i].amount);

                if (_amountToUnstake == totalAmountUnstakedSoFar) {
                    locksToRemove[currentIndexOfLocksToBeRemoved] = i;
                    currentIndexOfLocksToBeRemoved = currentIndexOfLocksToBeRemoved.add(1);
                    result = true;
                    break;
                } else if (_amountToUnstake < totalAmountUnstakedSoFar) {
                    stakedLocks[i].amount = totalAmountUnstakedSoFar.sub(_amountToUnstake);
                    result = true;
                    break;
                } else {
                    locksToRemove[currentIndexOfLocksToBeRemoved] = i;
                    currentIndexOfLocksToBeRemoved = currentIndexOfLocksToBeRemoved.add(1);
                }
            }
        }

        for (i = 0; i < currentIndexOfLocksToBeRemoved; i++) {
            delete stakedLocks[locksToRemove[i]];
        }

        return result;
    }

    function getReward() external nonReentrant {
        _getReward();
    }

    function _getReward() internal  {
        updateReward(msg.sender);
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function notifyRewardAmount(uint256 reward)
    external
    onlyOwner
    {
        updateReward(address(0));
        if (block.timestamp >= periodFinish) {
            rewardRate = reward.div(rewardsDuration);
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardRate);
            rewardRate = reward.add(leftover).div(rewardsDuration);
        }

        // Ensure the provided reward amount is not more than the balance in the contract.
        // This keeps the reward rate in the right range, preventing overflows due to
        // very high values of rewardRate in the earned and rewardsPerToken functions;
        // Reward + leftover must be less than 2^256 / 10^18 to avoid overflow.
        uint256 balance = rewardsToken.balanceOf(address(this));
        require(
            rewardRate <= balance.div(rewardsDuration),
            "Provided reward too high"
        );

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(rewardsDuration);
        emit RewardAdded(reward);
    }

    // Added to support recovering LP Rewards from other systems such as BAL to be distributed to holders
    function recoverERC20(address tokenAddress, uint256 tokenAmount)
    external
    onlyOwner
    {
        // Cannot recover the staking token or the rewards token
        require(
            tokenAddress != address(stakingToken) &&
            tokenAddress != address(rewardsToken),
            "Cannot withdraw the staking or rewards tokens"
        );
        IERC20(tokenAddress).safeTransfer(msg.sender, tokenAmount);
        emit Recovered(tokenAddress, tokenAmount);
    }

    function setRewardsDuration(uint256 _rewardsDuration) external onlyOwner {
        require(
            block.timestamp > periodFinish,
            "Previous rewards period must be complete before changing the duration for the new period"
        );
        rewardsDuration = _rewardsDuration;
        emit RewardsDurationUpdated(rewardsDuration);
    }


    function  updateReward(address account) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    /* ========== EVENTS ========== */

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Unlocked(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event Recovered(address token, uint256 amount);
}
