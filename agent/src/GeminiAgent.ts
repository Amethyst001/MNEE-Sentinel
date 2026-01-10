import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { VendorRegistry } from './VendorRegistry';

dotenv.config({ path: path.join(__dirname, '../../.env') });

function logToFile(msg: string) {
    try {
        const logPath = path.join(__dirname, '../../agent_debug.log');
        fs.appendFileSync(logPath, `${new Date().toISOString()} - ${msg}\n`);
    } catch (e) { }
}

export class GeminiAgent {
    private models: any[] = [];
    private currentModelIndex = 0;

    constructor(apiKeys: string | string[]) {
        const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];

        console.log(`🤖 GeminiAgent initialized with ${keys.length} API Keys (Rotation Active).`);

        const modelVariants = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-exp"];

        keys.forEach((key, kIndex) => {
            const genAI = new GoogleGenerativeAI(key);
            modelVariants.forEach(modelName => {
                this.models.push({
                    instance: genAI.getGenerativeModel({ model: modelName }),
                    name: `${modelName} [Key ${kIndex + 1}]`
                });
            });
        });

        // Shuffle models to distribute load across keys/models randomly on startup
        this.models = this.models.sort(() => Math.random() - 0.5);
    }

    /**
     * Parses a user's natural language request into a structured mandate intent.
     * @param userMessage e.g., "Allow payment of 500 MNEE to @devshop for AWS credits valid for 24h"
     */
    async parseIntent(userMessage: string) {
        const prompt = `
            You are an autonomous treasury agent. Parse the following request into a JSON object.
            
            Request: "${userMessage.replace(/"/g, '\\"')}"

            Return ONLY raw JSON (no markdown formatting):
            {
                "recipient": "string",
                "amount": number,
                "currency": "MNEE",
                "purpose": "string",
                "ttl_hours": number,
                "requires_multisig": boolean
            }
        `;

        try {
            logToFile(`Parser Input: ${userMessage}`);
            console.log("🔍 DEBUG: Calling Gemini API with prompt...");
            console.log("🔍 DEBUG: User message:", userMessage);
            const result = await this.generateWithRetry(prompt);
            const response = result.response;
            let text = response.text();
            logToFile(`Parser Raw Output: ${text}`);
            console.log("🔍 DEBUG: Raw Gemini response:", text);

            // Cleanup markdown code blocks if present
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            console.log("🔍 DEBUG: Cleaned response:", text);

            const parsed = JSON.parse(text);

            // PRODUCTION: Vendor Verification
            const vendor = VendorRegistry.findVendor(parsed.recipient);

            if (vendor) {
                console.log(`✅ Verified Vendor Identified: ${vendor.name} (Trust: ${vendor.riskTier})`);
                parsed.recipient = vendor.name;
                parsed.address = vendor.walletAddress;
                parsed.isVerified = true;
                parsed.riskTier = vendor.riskTier;
                logToFile(`Parser Success: Verified ${vendor.name}`);
            } else {
                console.log(`⚠️ Unknown Vendor: ${parsed.recipient} (Unverified)`);
                parsed.isVerified = false;
                parsed.address = null;
                logToFile(`Parser Success: Unverified ${parsed.recipient}`);
            }

            console.log("🔍 DEBUG: Parsed & Verified intent:", parsed);

            // Reject invalid amounts (Prevents hallucinations processing as $0 payments)
            if (parsed.amount <= 0) {
                console.log("⚠️ Rejected Intent: Amount is 0 or invalid.");
                return null;
            }

            return parsed;
        } catch (error: any) {
            logToFile(`Parser ERROR: ${error.message}`);
            console.error("❌ Gemini Intent Parsing Error:", error.message || error);
            // console.error("❌ Full error:", JSON.stringify(error, null, 2));
            return null;
        }
    }


    /**
     * Helper: Retry Logic with Multi-Key Rotation
     */
    private async generateWithRetry(prompt: string, retries = 14): Promise<any> {
        for (let i = 0; i < retries; i++) {
            try {
                const current = this.models[this.currentModelIndex];
                const keyIndex = Math.floor(this.currentModelIndex / 2);

                // VERBOSE: Always show what we're trying
                console.log(`🔑 [Agent Attempt ${i + 1}/${retries}] Using ${current.name} (Endpoint ${this.currentModelIndex + 1}/${this.models.length}, API Key ${keyIndex + 1}/7)`);

                return await current.instance.generateContent(prompt);
            } catch (error: any) {
                const isRateLimit = error.message?.includes('429') || error.status === 429;
                const isOverloaded = error.message?.includes('503') || error.status === 503;
                const isNotFound = error.message?.includes('404') || error.status === 404 || error.message?.includes('not found');

                if ((isRateLimit || isOverloaded || isNotFound) && i < retries - 1) {
                    // Rotate to next model
                    this.currentModelIndex = (this.currentModelIndex + 1) % this.models.length;

                    if (isNotFound) {
                        console.warn(`⚠️ Model Not Found (404). Rotating to Model Index ${this.currentModelIndex}...`);
                    } else if (isRateLimit) {
                        console.warn(`📉 Agent Rate Limit (429). Rotating to Model Index ${this.currentModelIndex}...`);
                    } else {
                        const delay = Math.pow(2, i) * 1000;
                        console.warn(`⚠️ Gemini API Overloaded (Status ${error.status}). Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                } else {
                    throw error;
                }
            }
        }
        throw new Error("All Gemini API retries exhausted.");
    }

    /**
     * Autonomous Negotiation Step.
     */
    async negotiateWithSupplier(item: string, initialOffer: number): Promise<number> {
        console.log(`🤝 Gemini Agent: Contacting Supplier for '${item}' at ${initialOffer} MNEE...`);

        const prompt = `
            ROLE: You are an Autonomous Sales Agent for a Digital Services Vendor.
            TASK: Negotiate a price for: "${item}".
            CURRENT PRICE: ${initialOffer} MNEE.
            
            INSTRUCTIONS:
            1. Analyze the item. If it is high volume (e.g. cloud credits, software), offer a discount (5-20%).
            2. If it is unique or low margin, offer small or no discount.
            3. RETURN ONLY THE FINAL PRICE NUMBER (e.g., 85).
            
            Do not be random. Be consistent with B2B sales logic.
        `;

        try {
            const result = await this.generateWithRetry(prompt);
            const text = result.response.text().replace(/[^0-9.]/g, '').trim();
            const finalPrice = parseFloat(text);

            if (!isNaN(finalPrice) && finalPrice < initialOffer) {
                console.log(`✅ Negotiation WON: Price reduced to ${finalPrice} (AI Decision).`);
                return finalPrice;
            } else {
                return initialOffer;
            }
        } catch (e) {
            return initialOffer * 0.95;
        }
    }
}
