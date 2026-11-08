// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CFDToken} from "./CFDToken.sol";
import {CrowdfundingCore} from "./CrowdfundingCore.sol";

contract FundingDAO is ReentrancyGuard {
    enum Action { Release, Cancel }
    struct Proposal {
        uint256 campaignId;
        Action action;
        uint48 snapshotBlock;
        uint64 deadline;
        uint64 executableAt;
        uint256 quorum;
        uint256 yes;
        uint256 no;
        bool executed;
    }
    CFDToken public immutable token;
    CrowdfundingCore public immutable core;
    uint256 public immutable votingPeriod;
    uint256 public immutable executionDelay;
    uint256 public constant QUORUM_PERCENT = 20;
    uint256 public constant MIN_PROPOSER_VOTES = 1 ether; // 1 CFD (18 décimales)
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    event ProposalCreated(uint256 indexed id, uint256 indexed campaignId, Action action, uint48 snapshotBlock, uint256 quorum, uint64 deadline, uint64 executableAt);
    event VoteCast(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id);
    constructor(CrowdfundingCore core_, uint256 votingPeriod_, uint256 executionDelay_) {
        require(address(core_) != address(0), "zero core");
        require(votingPeriod_ >= 1 hours && executionDelay_ >= 10 minutes, "unsafe delays");
        require(votingPeriod_ + executionDelay_ < core_.SETTLEMENT_PERIOD(), "delays exceed settlement");
        core = core_; token = core_.token();
        votingPeriod = votingPeriod_; executionDelay = executionDelay_;
    }
    function propose(uint256 campaignId, Action action) external returns(uint256 id) {
        require(campaignId < core.campaignCount(), "unknown campaign");
        require(core.isGovernable(campaignId), "campaign closed");
        if (action == Action.Release) require(core.canProposeRelease(campaignId), "release not ready");
        require(block.timestamp + votingPeriod + executionDelay < core.withdrawalDeadline(campaignId), "insufficient settlement time");
        // Dernier bloc terminé lors de la création : pas de votes frappés dans le même bloc.
        uint48 snapshot = uint48(block.number - 1);
        require(core.getPastCampaignVotes(campaignId, msg.sender, snapshot) >= MIN_PROPOSER_VOTES, "insufficient proposer votes");
        uint256 supply = core.getPastCampaignSupply(campaignId, snapshot);
        require(supply > 0, "empty electorate");
        uint256 quorum = (supply * QUORUM_PERCENT + 99) / 100;
        uint64 deadline = uint64(block.timestamp + votingPeriod);
        id = proposalCount++;
        proposals[id] = Proposal(campaignId, action, snapshot, deadline, uint64(deadline + executionDelay), quorum, 0, 0, false);
        emit ProposalCreated(id, campaignId, action, snapshot, quorum, deadline, uint64(deadline + executionDelay));
    }
    function vote(uint256 id, bool support) external {
        require(id < proposalCount, "unknown proposal");
        Proposal storage p = proposals[id];
        require(block.timestamp < p.deadline && !p.executed, "vote closed");
        require(core.isGovernable(p.campaignId), "campaign closed");
        require(!hasVoted[id][msg.sender], "already voted");
        uint256 weight = core.getPastCampaignVotes(p.campaignId, msg.sender, p.snapshotBlock);
        require(weight > 0, "no snapshot votes");
        hasVoted[id][msg.sender] = true;
        if (support) p.yes += weight; else p.no += weight;
        emit VoteCast(id, msg.sender, support, weight);
    }
    /// @notice Exécution permissionless : un utilisateur/keeper doit envoyer cette transaction.
    function execute(uint256 id) external nonReentrant {
        require(id < proposalCount, "unknown proposal");
        Proposal storage p = proposals[id];
        require(block.timestamp >= p.executableAt && !p.executed, "not executable");
        require(core.isGovernable(p.campaignId), "campaign closed");
        require(p.yes + p.no >= p.quorum && p.yes > p.no, "proposal rejected");
        p.executed = true;
        emit ProposalExecuted(id);
        if (p.action == Action.Release) core.authorizeRelease(p.campaignId);
        else core.cancelByGovernance(p.campaignId);
    }
}
