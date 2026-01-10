// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MNEEEscrow
 * @notice Holds MNEE funds and releases them based on ZK-proof verification (Commit-Reveal).
 */
contract MNEEEscrow is ReentrancyGuard, Ownable {
    IERC20 public immutable mneeToken;

    enum EscrowStatus { ACTIVE, COMPLETED, REFUNDED, DISPUTED }

    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        bytes32 proofCommitment; // Hash of the expected ZK proof or file
        uint256 deadline;
        EscrowStatus status;
    }

    mapping(bytes32 => Escrow) public escrows;

    event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount);
    event ProofCommitted(bytes32 indexed escrowId, bytes32 commitment);
    event FundsReleased(bytes32 indexed escrowId, address indexed seller, uint256 amount);
    event FundsRefunded(bytes32 indexed escrowId, address indexed buyer, uint256 amount);

    constructor(address _mneeToken) Ownable(msg.sender) {
        mneeToken = IERC20(_mneeToken);
    }

    /**
     * @notice Create a new escrow.
     * @param _seller The merchant/service provider.
     * @param _amount Amount of MNEE to lock.
     * @param _proofCommitment Hash of the expected file/proof (from the Mandate).
     * @param _durationSeconds Time until refund is possible.
     */
    function createEscrow(
        address _seller,
        uint256 _amount,
        bytes32 _proofCommitment,
        uint256 _durationSeconds
    ) external nonReentrant returns (bytes32) {
        require(_amount > 0, "Amount must be > 0");
        require(mneeToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        bytes32 escrowId = keccak256(abi.encodePacked(msg.sender, _seller, block.timestamp, _amount));

        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: _seller,
            amount: _amount,
            proofCommitment: _proofCommitment,
            deadline: block.timestamp + _durationSeconds,
            status: EscrowStatus.ACTIVE
        });

        emit EscrowCreated(escrowId, msg.sender, _seller, _amount);
        return escrowId;
    }

    /**
     * @notice Releases funds to the seller if the revealed proof matches the commitment.
     * @dev In a full ZK implementation, this would verify a Groth16/Plonk proof. 
     *      For this hackathon implementation, we verify the hash of the proof file matches the commitment.
     *      This is called by the Agent after off-chain TLSNotary verification.
     */
    function releaseFunds(bytes32 _escrowId, string calldata _proofData) external nonReentrant {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.ACTIVE, "Escrow not active");
        
        // Verify the provided proof data matches the commitment
        require(keccak256(abi.encodePacked(_proofData)) == escrow.proofCommitment, "Invalid proof");

        escrow.status = EscrowStatus.COMPLETED;
        require(mneeToken.transfer(escrow.seller, escrow.amount), "Transfer failed");

        emit FundsReleased(_escrowId, escrow.seller, escrow.amount);
    }

    /**
     * @notice Refunds the buyer if the deadline has passed.
     */
    function refund(bytes32 _escrowId) external nonReentrant {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.ACTIVE, "Escrow not active");
        require(block.timestamp >= escrow.deadline, "Deadline not passed");
        require(msg.sender == escrow.buyer || msg.sender == owner(), "Not authorized");

        escrow.status = EscrowStatus.REFUNDED;
        require(mneeToken.transfer(escrow.buyer, escrow.amount), "Transfer failed");

        emit FundsRefunded(_escrowId, escrow.buyer, escrow.amount);
    }
}
