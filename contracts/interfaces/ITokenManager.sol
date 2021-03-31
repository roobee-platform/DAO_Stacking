pragma solidity 0.7.3;

abstract contract ITokenManager {
    function mint(address _receiver, uint256 _amount) virtual external;

    function issue(uint256 _amount) virtual external;

    function assign(address _receiver, uint256 _amount) virtual external;

    function burn(address _holder, uint256 _amount) virtual external;

}