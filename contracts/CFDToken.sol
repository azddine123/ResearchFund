// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @notice CFD : pouvoir de gouvernance personnel, non négociable. 1 ETH = 1000 CFD.
/// @dev Interface ERC20, transferts volontairement restreints ; pas de promesse de rendement.
contract CFDToken is ERC20, ERC20Votes {
    address public immutable core;
    error OnlyCore();
    error NonTransferable();
    error SelfDelegationOnly();
    constructor(address core_) ERC20("CrowdFund Governance", "CFD") EIP712("CrowdFund Governance", "1") {
        require(core_ != address(0), "zero core");
        core = core_;
    }
    function mint(address account, uint256 amount) external {
        if (msg.sender != core) revert OnlyCore();
        if (delegates(account) == address(0)) _delegate(account, account);
        _mint(account, amount);
    }
    function burn(address account, uint256 amount) external {
        if (msg.sender != core) revert OnlyCore();
        _burn(account, amount);
    }
    function _delegate(address account, address delegatee) internal override {
        if (delegatee != account) revert SelfDelegationOnly();
        super._delegate(account, delegatee);
    }
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        if (from != address(0) && to != address(0)) revert NonTransferable();
        super._update(from, to, value);
    }
}
