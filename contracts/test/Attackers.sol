// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {CrowdfundingCore} from "../CrowdfundingCore.sol";
contract ReentrantActor {
    CrowdfundingCore public core;
    uint256 public id;
    bool public attempted;
    bool public reentrySucceeded;
    bool public rejectPayment;
    bool public withdrawMode;
    constructor(CrowdfundingCore core_) { core = core_; }
    function fund(uint256 id_) external payable { id = id_; core.contribute{value: msg.value}(id_); }
    function setReject(bool value) external { rejectPayment = value; }
    function claim() external { core.refund(id); }
    function withdraw(uint256 id_) external { id = id_; withdrawMode = true; core.withdrawFunds(id_); }
    receive() external payable {
        require(!rejectPayment, "refuse ETH");
        if (!attempted) {
            attempted = true;
            bytes memory data = withdrawMode ? abi.encodeCall(core.withdrawFunds,(id)) : abi.encodeCall(core.refund,(id));
            (bool ok,) = address(core).call(data);
            reentrySucceeded = ok;
        }
    }
}
