pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * @title InvoiceVerifier
 * @notice Proves that the Agent knows a private Invoice ID that hashes to the public commitment,
 *         AND that the amount is less than the public limit, without revealing the ID.
 */
template InvoiceVerifier() {
    // Private Inputs (The Secrets)
    signal input invoiceID;
    signal input actualAmount;

    // Public Inputs (The Constraints)
    signal input amountLimit;
    signal input expectedHash;

    // Output (Proof Valid?)
    signal output hashCheck;
    signal output limitCheck;

    // 1. Verify Hash: Poseidon(invoiceID) == expectedHash
    component hasher = Poseidon(1);
    hasher.inputs[0] <== invoiceID;
    
    // We constrain the output hash to match public input
    // In strict ZK, we'd enforce this via constraint: expectedHash === hasher.out;
    // but for flexibility we output the check result.
    hashCheck <== hasher.out;

    // 2. Verify Limit: actualAmount <= amountLimit
    component lessThan = LessThan(64); // 64-bit numbers
    lessThan.in[0] <== actualAmount;
    lessThan.in[1] <== amountLimit + 1; // +1 for inclusive <= check
    
    limitCheck <== lessThan.out;

    // Constraints
    expectedHash === hasher.out;
    limitCheck === 1;
}

component main {public [amountLimit, expectedHash]} = InvoiceVerifier();
