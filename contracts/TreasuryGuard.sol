// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
/// @notice Accord 2-sur-3 lié à un retrait précis, pas une autorisation globale.
contract TreasuryGuard {
    uint256 public constant REPLACEMENT_DELAY = 2 days;
    uint256 public signerEpoch;
    uint256 public replacementCount;
    struct Replacement {
        uint256 epoch;
        uint8 slot;
        address newSigner;
        uint8 count;
        uint64 executableAt;
        bool executed;
    }
    mapping(uint256 => Replacement) public replacements;
    mapping(uint256 => mapping(address => bool)) public replacementApprovedBy;
    event ReplacementProposed(uint256 indexed id, uint8 slot, address newSigner, uint256 epoch);
    event ReplacementApproval(uint256 indexed id, address indexed signer, bool approved, uint8 count, uint64 executableAt);
    event SignerReplaced(uint256 indexed id, address oldSigner, address newSigner, uint256 epoch);
    address[3] public signers;
    mapping(address => bool) public isSigner;
    mapping(bytes32 => mapping(address => bool)) public approvedBy;
    mapping(bytes32 => uint8) public approvals;
    event ApprovalChanged(bytes32 indexed key, address indexed signer, bool approved, uint8 count);
    constructor(address[3] memory signers_) {
        for (uint256 i; i < 3; ++i) {
            require(signers_[i] != address(0) && !isSigner[signers_[i]], "invalid signer");
            signers[i] = signers_[i]; isSigner[signers_[i]] = true;
        }
    }
    function withdrawalKey(address core, uint256 id, address beneficiary, uint256 amount) public view returns(bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), signerEpoch, core, id, beneficiary, amount));
    }
    function setApproval(address core, uint256 id, address beneficiary, uint256 amount, bool approved) external {
        require(isSigner[msg.sender], "not signer");
        bytes32 key = withdrawalKey(core, id, beneficiary, amount);
        require(approvedBy[key][msg.sender] != approved, "unchanged");
        approvedBy[key][msg.sender] = approved;
        if (approved) approvals[key]++; else approvals[key]--;
        emit ApprovalChanged(key, msg.sender, approved, approvals[key]);
    }
    function isApproved(address core, uint256 id, address beneficiary, uint256 amount) external view returns(bool) {
        return approvals[withdrawalKey(core, id, beneficiary, amount)] >= 2;
    }

    /// @notice Le proposant est la première approbation ; une seconde déclenche le délai.
    function proposeReplacement(uint8 slot, address newSigner) external returns(uint256 id) {
        require(isSigner[msg.sender], "not signer");
        require(slot < 3 && newSigner != address(0) && !isSigner[newSigner], "invalid replacement");
        id = replacementCount++;
        replacements[id] = Replacement(signerEpoch, slot, newSigner, 1, 0, false);
        replacementApprovedBy[id][msg.sender] = true;
        emit ReplacementProposed(id, slot, newSigner, signerEpoch);
        emit ReplacementApproval(id, msg.sender, true, 1, 0);
    }
    function approveReplacement(uint256 id, bool approved) external {
        require(isSigner[msg.sender], "not signer");
        require(id < replacementCount, "unknown replacement");
        Replacement storage r = replacements[id];
        require(!r.executed && r.epoch == signerEpoch, "stale replacement");
        require(replacementApprovedBy[id][msg.sender] != approved, "unchanged");
        replacementApprovedBy[id][msg.sender] = approved;
        if (approved) r.count++; else r.count--;
        if (r.count < 2) r.executableAt = 0;
        else if (r.executableAt == 0) r.executableAt = uint64(block.timestamp + REPLACEMENT_DELAY);
        emit ReplacementApproval(id, msg.sender, approved, r.count, r.executableAt);
    }
    function executeReplacement(uint256 id) external {
        require(id < replacementCount, "unknown replacement");
        Replacement storage r = replacements[id];
        require(!r.executed && r.epoch == signerEpoch, "stale replacement");
        require(r.count >= 2 && r.executableAt != 0 && block.timestamp >= r.executableAt, "replacement not ready");
        require(!isSigner[r.newSigner], "invalid replacement");
        address oldSigner = signers[r.slot];
        r.executed = true;
        isSigner[oldSigner] = false;
        isSigner[r.newSigner] = true;
        signers[r.slot] = r.newSigner;
        signerEpoch++; // Invalide toutes les anciennes signatures et propositions de rotation.
        emit SignerReplaced(id, oldSigner, r.newSigner, signerEpoch);
    }
}
