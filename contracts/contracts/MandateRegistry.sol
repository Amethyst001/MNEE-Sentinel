// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MandateRegistry
 * @notice Stores hashes of authorized Agent Mandates to prevent unauthorized spending.
 * @dev Implements the "Intent-based Mandates" requirement.
 */
contract MandateRegistry is Ownable {
    
    struct Mandate {
        address agent;
        uint256 maxAmount;
        uint256 expiry;
        bool isActive;
    }

    mapping(bytes32 => Mandate) public mandates;

    event MandateRegistered(bytes32 indexed mandateId, address indexed agent, uint256 maxAmount, uint256 expiry);
    event MandateRevoked(bytes32 indexed mandateId);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Registers a new mandate hash.
     * @param _mandateHash Hash of the off-chain signed mandate.
     * @param _agent Address of the authorized agent/signer.
     * @param _maxAmount Max MNEE spendable.
     * @param _expiry Unix timestamp when mandate expires.
     */
    function registerMandate(
        bytes32 _mandateHash,
        address _agent,
        uint256 _maxAmount,
        uint256 _expiry
    ) external onlyOwner {
        require(mandates[_mandateHash].agent == address(0), "Mandate already exists");
        
        mandates[_mandateHash] = Mandate({
            agent: _agent,
            maxAmount: _maxAmount,
            expiry: _expiry,
            isActive: true
        });

        emit MandateRegistered(_mandateHash, _agent, _maxAmount, _expiry);
    }

    function verifyMandate(bytes32 _mandateHash) external view returns (bool) {
        Mandate memory m = mandates[_mandateHash];
        return m.isActive && block.timestamp < m.expiry;
    }

    function revokeMandate(bytes32 _mandateHash) external onlyOwner {
        mandates[_mandateHash].isActive = false;
        emit MandateRevoked(_mandateHash);
    }
}
