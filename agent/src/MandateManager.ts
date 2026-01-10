import { ethers } from "ethers";

// EIP-712 Domain Separator
const DOMAIN = {
    name: "MNEESentinel",
    version: "1",
    chainId: 84532, // Base Sepolia (example)
    verifyingContract: "0x0000000000000000000000000000000000000000" // Registry Address
};

const TYPES = {
    Mandate: [
        { name: "agent", type: "address" },
        { name: "maxAmount", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" }
    ]
};

export class MandateManager {
    private signer: ethers.Wallet;

    constructor(privateKey: string) {
        this.signer = new ethers.Wallet(privateKey);
    }

    /**
     * Creates a standard AP2 Mandate Entitlement.
     * @param amount The max amount authorized
     * @param ttlSeconds How long the mandate is valid
     * @param conditions Optional: Array of conditions (e.g. ["UPTIME > 99%", "KYC_PASS"])
     */
    async createMandate(amount: string, ttlSeconds: number, conditions: string[] = []): Promise<any> {
        console.log("✍️ Signing AP2 Mandate (EIP-712)...");
        if (conditions.length > 0) {
            console.log(`🔗 Attaching Smart Conditions: [${conditions.join(", ")}]`);
        }

        const nonce = Math.floor(Math.random() * 1000000);
        const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;

        const mandate = {
            agent: this.signer.address,
            maxAmount: amount, // Renamed from maxAmount to amount in params, but type still expects maxAmount
            expiry: expiry,
            nonce: nonce,
            conditions: conditions, // New Field
        };

        const signature = await this.signer.signTypedData(DOMAIN, TYPES, mandate);

        // Hash for on-chain registry
        const hash = ethers.TypedDataEncoder.hash(DOMAIN, TYPES, mandate);

        return {
            mandate,
            signature,
            hash
        };
    }

    verifyMandate(mandate: any, signature: string) {
        return ethers.verifyTypedData(DOMAIN, TYPES, mandate, signature);
    }
}
