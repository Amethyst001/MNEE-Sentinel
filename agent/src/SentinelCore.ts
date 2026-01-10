import { GeminiAgent } from "./GeminiAgent";
import { GeminiAuditor } from "./GeminiAuditor";
import { VendorRegistry } from "./VendorRegistry";
import { AuditLogger } from "./AuditLogger";
import { TokenService } from "./TokenService";
import { ZKProver } from "./ZKProver";

export interface SentinelResponse {
    status: 'SUCCESS' | 'BLOCKED' | 'NEEDS_APPROVAL' | 'ERROR';
    message: string;
    data?: any;
}

/**
 * @title SentinelCore
 * @notice Centralized "Brain" for Omnichannel Treasury Operations.
 */
export class SentinelCore {
    private agent: GeminiAgent;
    private auditor: GeminiAuditor;
    private logger: AuditLogger;
    private zk: ZKProver;

    constructor(apiKeys: string[]) {
        this.agent = new GeminiAgent(apiKeys);
        this.auditor = new GeminiAuditor(apiKeys);
        this.logger = new AuditLogger();
        this.zk = new ZKProver();
    }

    async processPaymentRequest(text: string, userId: string, platform: 'TELEGRAM' | 'SLACK'): Promise<SentinelResponse> {
        try {
            // 1. Parse Intent
            const intent = await this.agent.parseIntent(text);

            // Handle Parsing Failure
            if (!intent) {
                return { status: 'ERROR', message: "❌ Could not understand payment intent. Please check formatting (e.g., 'Pay 50 MNEE to AWS')." };
            }

            // 2. Resolve Registry & enforce Production Verification
            const verifiedAddr = VendorRegistry.getAddress(intent.recipient);
            const isProduction = process.env.MODE === 'PRODUCTION';

            if (!verifiedAddr && isProduction) {
                return {
                    status: 'BLOCKED',
                    message: `🚫 **Vendor Unverified**: '${intent.recipient}' is not in the Trusted Registry.\nIn Production, you can only pay verified vendors.`
                };
            }

            if (verifiedAddr) intent.address = verifiedAddr;

            // 3. Negotiate
            // (Only negotiate if it's a verified vendor service, else skip optimization for P2P?)
            // For now, we negotiate everything.
            const finalPrice = await this.agent.negotiateWithSupplier(intent.recipient, intent.amount);
            const saved = intent.amount - Math.floor(finalPrice);
            intent.amount = Math.floor(finalPrice);

            // 4. Audit & ZK Generation
            const audit = await this.auditor.auditMandate(intent, text);

            if (!audit.approved) {
                await this.logger.logEvent("AUDIT_BLOCKED", `Audit for ${intent.recipient}`, "BLOCKED", { reason: audit.reason });

                const bold = platform === 'SLACK' ? '*' : '**';
                let msg = `🚫 ${bold}BLOCKED by Policy${bold}\n\n`;
                const parts = audit.reason.split('|');
                if (parts.length > 1) {
                    msg += `${bold}${parts[0].replace('Title:', '').trim()}${bold}\n\n${parts[1].replace('Explanation:', '').trim()}`;
                } else {
                    msg += audit.reason;
                }

                return { status: 'BLOCKED', message: msg };
            }

            // Generate ZK Proof for Compliance
            const zkProof = await this.zk.generateInvoiceProof(Date.now(), intent.amount, 1000, "hashed_metadata");

            await this.logger.logEvent("SENTINEL_CORE", `Processed for ${intent.recipient}`, "SUCCESS", {
                platform,
                saved,
                riskScore: audit.riskScore,
                zkProof: zkProof.proof.protocol
            });

            return {
                status: 'NEEDS_APPROVAL',
                message: "✅ Audit Passed & ZK-Proof Generated.",
                data: { intent, saved, audit, zkProof }
            };

        } catch (e: any) {
            return { status: 'ERROR', message: `⚠️ System Error: ${e.message}` };
        }
    }

    getAuditLogger() { return this.logger; }
    getAuditor() { return this.auditor; }
}
