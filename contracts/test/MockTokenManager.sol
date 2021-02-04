pragma solidity ^0.7.3;
import "./MintableToken.sol";
import "hardhat/console.sol";


contract MockTokenManager {

    MintableToken public token;

    function init(address _token) public {
        token = MintableToken(_token);
    }

    function mint(address _receiver, uint256 _amount)  external {
        token.mint(_receiver, _amount);
    }

    function burn(address _holder, uint256 _amount)  external {
        token.burn(_holder, _amount);
    }
}
