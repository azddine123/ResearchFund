// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CFDToken} from "./CFDToken.sol";
import {TreasuryGuard} from "./TreasuryGuard.sol";

contract CrowdfundingCore is AccessControl, Pausable, ReentrancyGuard {
    using Checkpoints for Checkpoints.Trace208;
    uint256 public constant SETTLEMENT_PERIOD = 14 days;
    mapping(uint256 => mapping(address => Checkpoints.Trace208)) private campaignVotes;
    mapping(uint256 => Checkpoints.Trace208) private campaignSupply;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    uint256 public constant TOKEN_RATE = 1000;
    uint256 public constant MULTISIG_THRESHOLD = 1 ether;
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 90 days;
    enum Status { Active, Successful, Failed, Cancelled, Refundable }
    struct Campaign {
        address beneficiary;
        uint64 deadline;
        bool cancelled;
        bool releaseApproved;
        bool withdrawn;
        uint256 goal;
        uint256 raised;
        uint256 escrow;
        string metadataCID;
    }
    CFDToken public immutable token;
    TreasuryGuard public immutable guard;
    address public governance;
    uint256 public campaignCount;
    uint256 public totalEscrow;
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    event CampaignCreated(uint256 indexed id, address indexed creator, address indexed beneficiary, uint256 goal, uint64 deadline, string metadataCID);
    event Contribution(uint256 indexed id, address indexed contributor, uint256 amount, uint256 minted);
    event Refunded(uint256 indexed id, address indexed contributor, uint256 amount);
    event Withdrawn(uint256 indexed id, address indexed beneficiary, uint256 amount);
    event GovernanceConfigured(address indexed governance);
    event ReleaseApproved(uint256 indexed id);
    event CampaignCancelled(uint256 indexed id);
    constructor(address admin, TreasuryGuard guard_) {
        require(admin != address(0) && address(guard_) != address(0), "zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin); _grantRole(ADMIN_ROLE, admin);
        guard = guard_; token = new CFDToken(address(this));
    }
    modifier exists(uint256 id) { require(id < campaignCount, "unknown campaign"); _; }
    modifier onlyGovernance() { require(msg.sender == governance, "only governance"); _; }
    function configureGovernance(address dao) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(governance == address(0) && dao.code.length > 0, "invalid configuration");
        governance = dao; emit GovernanceConfigured(dao);
    }
    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }
    /// @dev CID en texte, aucun titre/document personnel stocké sur la chaîne.
    function createCampaign(uint256 goal, uint256 duration, address beneficiary, string calldata metadataCID)
        external whenNotPaused returns(uint256 id) {
        require(governance != address(0), "not configured");
        require(goal > 0 && beneficiary != address(0), "invalid campaign");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "invalid duration");
        // Validation complète du CID côté client ; bornes défensives on-chain.
        require(bytes(metadataCID).length >= 46 && bytes(metadataCID).length <= 100, "invalid CID");
        id = campaignCount++;
        uint64 deadline = uint64(block.timestamp + duration);
        campaigns[id] = Campaign(beneficiary, deadline, false, false, false, goal, 0, 0, metadataCID);
        emit CampaignCreated(id, msg.sender, beneficiary, goal, deadline, metadataCID);
    }
    function status(uint256 id) public view exists(id) returns(Status) {
        Campaign storage c = campaigns[id];
        if (c.cancelled) return Status.Cancelled;
        if (c.withdrawn) return Status.Successful;
        if (block.timestamp >= c.deadline + SETTLEMENT_PERIOD) return Status.Refundable;
        if (block.timestamp < c.deadline) return Status.Active;
        return c.raised >= c.goal ? Status.Successful : Status.Failed;
    }
    function withdrawalDeadline(uint256 id) public view exists(id) returns(uint256) {
        return campaigns[id].deadline + SETTLEMENT_PERIOD;
    }
    function isGovernable(uint256 id) public view exists(id) returns(bool) {
        Status s = status(id);
        return !campaigns[id].withdrawn && (s == Status.Active || s == Status.Successful);
    }
    function canProposeRelease(uint256 id) external view exists(id) returns(bool) {
        Campaign storage c = campaigns[id];
        return isGovernable(id) && block.timestamp >= c.deadline && c.raised >= c.goal && !c.releaseApproved;
    }
    // Poids locaux à la campagne, unité 18 décimales (1 ETH = 1 000 voix).
    // L'historique reste consultable, mais une campagne terminale n'est plus gouvernable.
    function getPastCampaignVotes(uint256 id, address voter, uint48 atBlock) external view exists(id) returns(uint256) {
        require(atBlock < block.number, "future snapshot");
        return campaignVotes[id][voter].upperLookupRecent(atBlock);
    }
    function getPastCampaignSupply(uint256 id, uint48 atBlock) external view exists(id) returns(uint256) {
        require(atBlock < block.number, "future snapshot");
        return campaignSupply[id].upperLookupRecent(atBlock);
    }
    function _checkpoint(uint256 id, address voter, uint256 supply) private {
        uint48 key = SafeCast.toUint48(block.number);
        campaignVotes[id][voter].push(key, SafeCast.toUint208(contributions[id][voter] * TOKEN_RATE));
        campaignSupply[id].push(key, SafeCast.toUint208(supply));
    }
    function contribute(uint256 id) external payable exists(id) whenNotPaused nonReentrant {
        require(status(id) == Status.Active && msg.value > 0, "not fundable");
        Campaign storage c = campaigns[id];
        c.raised += msg.value; c.escrow += msg.value;
        totalEscrow += msg.value; contributions[id][msg.sender] += msg.value;
        _checkpoint(id, msg.sender, campaignSupply[id].latest() + msg.value * TOKEN_RATE);
        token.mint(msg.sender, msg.value * TOKEN_RATE);
        emit Contribution(id, msg.sender, msg.value, msg.value * TOKEN_RATE);
    }
    function refund(uint256 id) external exists(id) nonReentrant {
        Status s = status(id);
        require(s == Status.Failed || s == Status.Cancelled || s == Status.Refundable, "not refundable");
        uint256 amount = contributions[id][msg.sender];
        require(amount > 0, "nothing to refund");
        contributions[id][msg.sender] = 0;
        campaigns[id].escrow -= amount; totalEscrow -= amount;
        _checkpoint(id, msg.sender, campaignSupply[id].latest() - amount * TOKEN_RATE);
        token.burn(msg.sender, amount * TOKEN_RATE);
        emit Refunded(id, msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "refund transfer failed");
    }
    /// @notice Tout ou rien : collecte terminée, objectif atteint, délai de versement non expiré.
    function authorizeRelease(uint256 id) external onlyGovernance exists(id) whenNotPaused {
        Campaign storage c = campaigns[id];
        require(!c.cancelled && !c.withdrawn && !c.releaseApproved && c.escrow > 0, "not releasable");
        require(block.timestamp >= c.deadline && c.raised >= c.goal, "goal or deadline not met");
        require(block.timestamp < withdrawalDeadline(id), "settlement expired");
        c.releaseApproved = true; emit ReleaseApproved(id);
    }
    /// @notice Gel définitif : annulation + remboursements individuels, jamais confiscation.
    function cancelByGovernance(uint256 id) external onlyGovernance exists(id) {
        Campaign storage c = campaigns[id];
        require(!c.withdrawn && !c.cancelled, "cannot cancel");
        c.cancelled = true; emit CampaignCancelled(id);
    }
    function withdrawFunds(uint256 id) external exists(id) whenNotPaused nonReentrant {
        Campaign storage c = campaigns[id];
        require(msg.sender == c.beneficiary, "not beneficiary");
        require(c.releaseApproved && !c.cancelled && !c.withdrawn, "not authorized");
        require(block.timestamp < withdrawalDeadline(id), "settlement expired");
        uint256 amount = c.escrow;
        require(amount > 0, "empty campaign");
        if (amount > MULTISIG_THRESHOLD) {
            require(guard.isApproved(address(this), id, c.beneficiary, amount), "multisig required");
        }
        c.withdrawn = true; c.escrow = 0; totalEscrow -= amount;
        emit Withdrawn(id, msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw transfer failed");
    }
}
