pragma solidity 0.7.3;

abstract contract ITokenManager {
    function mint(address receiver, uint96 amount) virtual external;

    function issue(uint96 _amount) virtual external;

    function assign(address _receiver, uint96 _amount) virtual external;

    function burn(address holder, uint96 amount) virtual external;

}