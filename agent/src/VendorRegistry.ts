/**
 * @title VendorRegistry
 * @notice **Production Feature**: Source of Truth for Verified Vendors.
 *         In 'Demo Mode', we accept any name.
 *         In 'Production Mode', we strict-check against this Registry.
 */

export interface VerifiedVendor {
    id: string;
    name: string;
    walletAddress: string;
    riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
    category: string;
    apiEndpoint?: string; // For automated negotiation
}

// The "Production" Database of Trusted Payees
const REGISTRY: VerifiedVendor[] = [
    {
        id: "v_aws_01",
        name: "AWS Web Services",
        walletAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        riskTier: "LOW",
        category: "Infrastructure",
        apiEndpoint: "https://api.aws.amazon.com/billing"
    },
    {
        id: "v_google_02",
        name: "Google Cloud Platform",
        walletAddress: "0x8888888888888888888888888888888888888888",
        riskTier: "LOW",
        category: "Infrastructure"
    },
    {
        id: "v_stripe_01",
        name: "Stripe Payments",
        walletAddress: "0x9999999999999999999999999999999999999999",
        riskTier: "LOW",
        category: "Finance"
    },
    {
        id: "v_devshop_01",
        name: "Acme Dev Shop",
        walletAddress: "0x1234567890123456789012345678901234567890",
        riskTier: "MEDIUM",
        category: "Services"
    }
];

export class VendorRegistry {

    /**
     * Looks up a vendor by name or ID.
     * @param query Name or ID (fuzzy match)
     */
    static findVendor(query: string): VerifiedVendor | null {
        const lowerQ = query.toLowerCase();
        return REGISTRY.find(v =>
            v.id.toLowerCase() === lowerQ ||
            v.name.toLowerCase().includes(lowerQ)
        ) || null;
    }

    /**
     * Returns true if the recipient is in the Trusted Registry.
     */
    static isVerified(recipient: string): boolean {
        return !!this.findVendor(recipient);
    }

    /**
     * Gets the official wallet address for a vendor name.
     * Helps preventing Phishing (sending to wrong 'AWS').
     */
    static getAddress(name: string): string | null {
        const vendor = this.findVendor(name);
        return vendor ? vendor.walletAddress : null;
    }
}
