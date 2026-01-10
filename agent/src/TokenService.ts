import { ethers } from "ethers";

/**
 * @title TokenService
 * @notice Handles interactions with the MNEE Stablecoin Contract.
 *         Default Address: 0x8ccedbAe4916b79da7F3F612EfB2EB93A2bFD6cF (Base Sepolia / Eth Sepolia)
 *         Implements ERC-20 Encode Functionality for Paymaster Execution.
 */
export class TokenService {
    private provider: ethers.JsonRpcProvider;
    private mneeAddress: string;

    // Minimal ERC-20 ABI for Transfer and Approval
    private abi = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function transferFrom(address from, address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)"
    ];

    constructor(tokenAddress?: string, rpcUrl?: string) {
        // Default to the official MNEE Hackathon address on Ethereum
        this.mneeAddress = tokenAddress || "0x8ccedbAe4916b79da7F3F612EfB2EB93A2bFD6cF";
        // Use PublicNode Sepolia RPC (More reliable SSL config)
        this.provider = new ethers.JsonRpcProvider(rpcUrl || "https://ethereum-sepolia.publicnode.com");
    }

    /**
     * Gets the current MNEE Token Address being used
     */
    getAddress(): string {
        return this.mneeAddress;
    }

    /**
     * Encodes a transfer transaction for the Paymaster to execute.
     * This allows the bot to generate the exact data needed for the blockchain.
     */
    encodeTransfer(recipient: string, amount: string): string {
        const iface = new ethers.Interface(this.abi);
        // Assuming MNEE has 18 decimals, like standard ERC-20
        const amountWei = ethers.parseUnits(amount, 18);
        return iface.encodeFunctionData("transfer", [recipient, amountWei]);
    }

    /**
     * Encodes a transferFrom transaction (for Mandates where user approved the contract).
     */
    encodeTransferFrom(sender: string, recipient: string, amount: string): string {
        const iface = new ethers.Interface(this.abi);
        const amountWei = ethers.parseUnits(amount, 18);
        return iface.encodeFunctionData("transferFrom", [sender, recipient, amountWei]);
    }

    /**
     * READ-ONLY: Checks balance of a user (Real Blockchain Call)
     */
    async getBalance(address: string): Promise<string> {
        try {
            const contract = new ethers.Contract(this.mneeAddress, this.abi, this.provider);
            const balance = await contract.balanceOf(address);
            return ethers.formatUnits(balance, 18);
        } catch (error) {
            console.warn("⚠️ Could not fetch real balance (RPC might be down or rate limited). Returning 0.00");
            return "0.00";
        }
    }

    /**
     * WRITE: Actually sends MNEE tokens on the blockchain (Base Sepolia)
     * Returns the real transaction hash
     */
    async sendTransfer(privateKey: string, recipient: string, amount: string): Promise<{ success: boolean, txHash?: string, error?: string }> {
        try {
            const wallet = new ethers.Wallet(privateKey, this.provider);
            const contract = new ethers.Contract(this.mneeAddress, this.abi, wallet);

            const amountWei = ethers.parseUnits(amount, 18);
            console.log(`📤 Broadcasting REAL transaction: ${amount} MNEE to ${recipient}`);

            const tx = await contract.transfer(recipient, amountWei);
            console.log(`⏳ Transaction sent, waiting for confirmation...`);
            console.log(`📋 Tx Hash: ${tx.hash}`);

            // Wait for 1 confirmation
            const receipt = await tx.wait(1);
            console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

            return { success: true, txHash: tx.hash };
        } catch (error: any) {
            console.error("❌ Transaction failed:", error.message);
            return { success: false, error: error.message };
        }
    }
}
