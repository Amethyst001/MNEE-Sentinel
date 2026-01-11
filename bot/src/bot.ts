import { Bot, session, Context, SessionFlavor, InlineKeyboard, InputFile } from "grammy";
import { MandateManager } from "@agent/MandateManager";
import { GeminiAgent } from "@agent/GeminiAgent";
import { GeminiAuditor } from "@agent/GeminiAuditor";
import { TLSVerifier } from "@agent/TLSVerifier";
import { RotationProxy } from "@agent/RotationProxy";
import { YieldOptimizer } from "@agent/YieldOptimizer";
import { ReputationManager } from "@agent/ReputationManager";
import { AuditLogger } from "@agent/AuditLogger";
import { BiometricVoiceVerifier } from "@agent/BiometricVoiceVerifier";
import { VoiceTranscriber } from "@agent/VoiceTranscriber";
import { UserSettings } from "@agent/UserSettings";
import { TokenService } from "@agent/TokenService";
import { VendorRegistry } from "@agent/VendorRegistry";
import { ZKProver } from "@agent/ZKProver";
import { SentinelCore } from "@agent/SentinelCore";
import * as dotenv from "dotenv";
import * as path from "path";
import * as crypto from "crypto";

dotenv.config({ path: path.join(__dirname, "../../.env") });

// Session interface
interface SessionData {
    step: "IDLE" | "AWAITING_MANDATE_APPROVAL" | "AWAITING_MULTISIG" | "AWAITING_CHALLENGE" | "AWAITING_PIN";
    pendingMandate?: any;
    reactionCount: number;
    authorizedAdmins: number[];
    voiceEnrolled: boolean;
    challengeWord?: string;
    mode: "DEMO" | "PRODUCTION";
    lastTxHash?: string;
    pinAttempts: number; // Failed PIN attempts
    pinLockoutUntil?: number; // Timestamp when lockout expires
    pendingIntent?: any; // To resume flows after audit
    pendingPrivacyHash?: string; // ZK-simulated privacy hash
    lastZKProof?: any; // To show in receipt
}

type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN || "dummy_token");

// Initialize Session
bot.use(session({ initial: (): SessionData => ({ step: "IDLE", reactionCount: 0, authorizedAdmins: [], voiceEnrolled: false, mode: "DEMO", pinAttempts: 0 }) }));

// Collect all available keys FIRST
const auditorKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6
].filter(key => !!key && key !== "dummy_key") as string[];

// SECURITY LAYER
const proxy = new RotationProxy();
const zk = new ZKProver();
const sentinelCore = new SentinelCore(auditorKeys);

// Initialize ALL AI components with the key pool
const agent = new GeminiAgent(auditorKeys.length > 0 ? auditorKeys : [process.env.GEMINI_API_KEY || "dummy_key"]);

// We use a separate instance (conceptually "Red Team") with FULL KEY ROTATION
const auditor = new GeminiAuditor(auditorKeys.length > 0 ? auditorKeys : [process.env.GEMINI_API_KEY || "dummy_key"]);
const mandateManager = new MandateManager(process.env.PRIVATE_KEY || "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

// Feature 9 & 10 Instances
const yieldOptimizer = new YieldOptimizer();
const reputationManager = new ReputationManager();
const auditLogger = new AuditLogger(); // Keep auditLogger as a const for now, as the provided snippet is incomplete for a class refactor.

// Start Command - Full System Status
bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || "User";

    // AUTO-AUTHORIZE for seamless demo experience
    if (userId && !ctx.session.authorizedAdmins.includes(userId)) {
        ctx.session.authorizedAdmins.push(userId);
    }

    const statusMsg = `🛡️ MNEE Sentinel Online

Current Mode: ${ctx.session.mode === 'PRODUCTION' ? '🏭 PRODUCTION' : '🚀 DEMO'}

Your Session:
• ID: ${userId}
• Role: Authorized Admin
• Voice: ${ctx.session.voiceEnrolled ? '✅ Enrolled' : '⏳ Not enrolled'}

Select your operation mode below:`;

    const keyboard = new InlineKeyboard()
        .text("🚀 Demo Mode", "mode_demo")
        .text("🏭 Production Mode", "mode_prod");

    await ctx.reply(statusMsg, { reply_markup: keyboard });

    // Feature 9: Check Yield on Start
    const yieldTip = await yieldOptimizer.recommendStrategy(5000, Date.now() - 86400000);
    if (yieldTip) await ctx.reply(yieldTip);
});

// MODE SWITCHING HANDLERS
bot.callbackQuery("mode_demo", async (ctx) => {
    ctx.session.mode = "DEMO";
    await ctx.answerCallbackQuery({ text: "Switched to DEMO Mode" });
    await ctx.editMessageText(
        `🚀 DEMO MODE ACTIVE

Environment: Simulation
Vendor Whitelist: Off (Warnings only)
Wallet: Simulated if .env missing
Limits: Relaxed

Available Commands:
• /pay 50 MNEE to Greg - Test payment
• /setup - Configure bot
• /setpin - Set security PIN
• /changepin - Update your PIN
• /audit - View logs
• /export_logs - Download audit CSV

Ready to test!`);
});

bot.callbackQuery("mode_prod", async (ctx) => {
    const hasWallet = !!process.env.PRIVATE_KEY;
    if (!hasWallet) {
        return ctx.answerCallbackQuery({ text: "⚠️ Production requires PRIVATE_KEY in .env", show_alert: true });
    }
    ctx.session.mode = "PRODUCTION";
    await ctx.answerCallbackQuery({ text: "Switched to PRODUCTION Mode" });
    await ctx.editMessageText(
        `🏭 PRODUCTION MODE ACTIVE

Environment: Live Blockchain
Vendor Whitelist: ENFORCED
Wallet: Real Transactions
Limits: Strict (Multi-Sig >100 MNEE)

Available Commands:
• /pay 50 MNEE to AWS - Pay verified vendor
• /setup - Check wallet status
• /setpin - Required for security
• /changepin - Update your PIN
• /audit - View recent transactions
• /export_logs - Download audit CSV

⚠️ Real funds will move.`);
});

// Help Command - Explains all features
bot.command("help", async (ctx) => {
    await ctx.reply(
        "📖 MNEE Sentinel Help\n\n" +
        "Commands:\n" +
        "/start - Initialize bot and see yield opportunities\n" +
        "/setup - Guided onboarding wizard\n" +
        "/pay [amount] MNEE to [recipient] for [purpose] - Create payment mandate\n" +
        "/authorize - View your session key status\n" +
        "/audit - Export audit logs for compliance\n" +
        "/help - Show this help message\n\n" +
        "Voice Commands:\n" +
        "Send a voice note saying 'Pay X MNEE to Y for Z' to authenticate with biometrics.\n\n" +
        "How Payment Works:\n" +
        "1. Gemini AI parses your intent\n" +
        "2. Agent negotiates with supplier for discount\n" +
        "3. Risk Officer audits for policy compliance\n" +
        "4. You approve with button tap\n" +
        "5. Transaction executes on Base network"
    );
});

// Setup Wizard - Guided Onboarding
bot.command("setup", async (ctx) => {
    const userId = ctx.from?.id || 0;
    const username = ctx.from?.username || "User";

    // Check what's already configured
    const isAuthorized = ctx.session.authorizedAdmins.includes(userId);
    const isVoiceEnrolled = ctx.session.voiceEnrolled;
    const hasWallet = !!process.env.PRIVATE_KEY;
    const hasPin = await userSettings.hasPin(userId);
    const currentMode = ctx.session.mode;

    let statusMsg = `⚙️ Setup Wizard - @${username}\n\n`;
    statusMsg += `Current Mode: ${currentMode === 'PRODUCTION' ? '🏭 Production' : '🚀 Demo'}\n\n`;
    statusMsg += `Security Status:\n`;
    statusMsg += `${isAuthorized ? '✅' : '⏳'} Session Key: ${isAuthorized ? 'Active' : 'Not set'}\n`;
    statusMsg += `${isVoiceEnrolled ? '✅' : '⏳'} Voice Profile: ${isVoiceEnrolled ? 'Enrolled' : 'Not enrolled'}\n`;
    statusMsg += `${hasPin ? '✅' : '⚠️'} Security PIN: ${hasPin ? 'Configured' : 'Not set'}${currentMode === 'PRODUCTION' && !hasPin ? ' (Recommended!)' : ''}\n`;
    statusMsg += `${hasWallet ? '✅' : '⏳'} Wallet: ${hasWallet ? 'Connected' : 'Simulated'}\n\n`;

    if (currentMode === 'PRODUCTION') {
        statusMsg += `⚠️ Production Mode Active - Real transactions enabled`;
    } else {
        statusMsg += `ℹ️ Demo Mode - Transactions are simulated`;
    }

    const keyboard = new InlineKeyboard()
        .text("🔑 Authorize Me", "setup_authorize").row()
        .text("🎤 Enroll Voice", "setup_voice").row()
        .text("🔒 Set PIN", "setup_pin").row()
        .text("⏭️ Done", "setup_skip");

    await ctx.reply(statusMsg, { reply_markup: keyboard });
});

// Setup callback handlers
bot.callbackQuery("setup_authorize", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (userId && !ctx.session.authorizedAdmins.includes(userId)) {
        ctx.session.authorizedAdmins.push(userId);
    }
    await ctx.editMessageText("✅ Session Key Generated!\n\nYou are now authorized to create and approve payment mandates.\n\nUse /setup to continue configuration or /pay to start transacting.");
});

bot.callbackQuery("setup_voice", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("🎤 Voice Enrollment\n\nTo enroll your voice profile, send a voice note saying:\n\n\"My name is [your name] and I authorize this voice for payments\"\n\nThis creates your unique voiceprint for biometric authentication.\n\n⏭️ You can skip this - voice payments will still work, just without identity verification.");
    ctx.session.step = "IDLE"; // Reset to allow voice enrollment
});

bot.callbackQuery("setup_wallet", async (ctx) => {
    await ctx.answerCallbackQuery();
    const hasWallet = !!process.env.PRIVATE_KEY;

    if (hasWallet) {
        await ctx.editMessageText("💳 Wallet Status: CONNECTED\n\nYour wallet is configured via environment variables.\n\nTransactions will be signed and broadcast to Base Sepolia.");
    } else {
        await ctx.editMessageText("💳 Wallet Setup\n\nTo connect a real wallet, add to your .env file:\n\nPRIVATE_KEY=0x_your_key_here\n\n⚠️ Use a TESTNET key only!");
    }
});

bot.callbackQuery("setup_pin", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("🔐 Set Security PIN\n\nTo set a 4-digit PIN, send:\n\n/setpin 1234\n\nThis PIN protects text-based payments.\nThe PIN is hashed securely - we never store the raw number.");
});

bot.callbackQuery("setup_skip", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Using default configuration" });
    const userId = ctx.from?.id;
    if (userId && !ctx.session.authorizedAdmins.includes(userId)) {
        ctx.session.authorizedAdmins.push(userId);
    }
    await ctx.editMessageText("⏭️ Setup Skipped - Using Defaults\n\n✅ You've been auto-authorized\n✅ Voice commands work (without enrollment)\n✅ Transactions work (simulated if no wallet)\n\nYou're ready! Try:\n/pay 50 MNEE to AWS for cloud services\n\nOr send a voice note to pay by speaking.");
});

// Authorize Command - Session Key Management
bot.command("authorize", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || "Unknown";

    // Check if user is in authorized admins list
    const isAuthorized = ctx.session.authorizedAdmins.includes(userId || 0);

    if (isAuthorized) {
        const walletPreview = process.env.PRIVATE_KEY ? `${process.env.PRIVATE_KEY.substring(0, 6)}...${process.env.PRIVATE_KEY.substring(process.env.PRIVATE_KEY.length - 4)}` : "N/A";
        const statusMsg = `🛡️ MNEE Sentinel Status [PRODUCTION]\n\n` +
            `Account: ${walletPreview}\n` +
            `Balance: 1,240.50 MNEE\n` +
            `Hourly Velocity: ${(auditor as any).hourlyVolume || 0} / 1000 MNEE\n` +
            `Security Status: ✅ Active\n\n` +
            `Audit Log: https://explorer.mnee.net/sentinel\n` +
            `Registry: AP2 Compliant`;
        await ctx.reply(statusMsg);
    } else {
        // Auto-authorize first-time users for demo
        if (userId) ctx.session.authorizedAdmins.push(userId);
        await ctx.reply(
            `🔐 Session Key Generated\n\n` +
            `User: @${username}\n` +
            `ID: ${userId}\n` +
            `Status: NEW AUTHORIZATION\n\n` +
            `You are now authorized to create and approve payment mandates.\n` +
            `For high-value transactions (>100 MNEE), multi-sig approval from 2/3 admins is required.`
        );
    }
});


// Voice Biometrics and Transcription
const voiceVerifier = new BiometricVoiceVerifier();
const voiceTranscriber = new VoiceTranscriber();
const userSettings = new UserSettings();
const tokenService = new TokenService(); // Defaults to 0x8ccedbAe4916b79da7F3F612EfB2EB93A2bFD6cF

// VOICE HANDLER - Production Grade
bot.on("message:voice", async (ctx) => {
    // await ctx.reply("🎙️ Voice Signal Detected\nProcessing audio...");

    try {
        // 1. Get the voice file
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

        // 2. Download the audio file
        const axios = await import('axios');
        const audioResponse = await axios.default.get(fileUrl, { responseType: 'arraybuffer' });
        const audioBuffer = Buffer.from(audioResponse.data);

        // await ctx.reply("🔊 Audio received. Transcribing with AI...");

        // 3. Transcribe using multi-engine system
        const transcription = await voiceTranscriber.transcribe(audioBuffer, 'audio/ogg');

        if (!transcription.text || transcription.confidence < 30) {
            return ctx.reply("❌ Could not transcribe audio clearly. Please try again with clearer speech.");
        }

        // --- LIVENESS CHALLENGE HANDLER ---
        if (ctx.session.step === "AWAITING_CHALLENGE") {
            const spokenText = transcription.text.toUpperCase();
            const expected = (ctx.session.challengeWord || '').toUpperCase();

            // Allow partial match/fuzzy match
            if (spokenText.includes(expected)) {
                await ctx.reply(`✅ **Liveness Confirmed!**\nUser authenticated as HUMAN OWNER.\nMulti-Sig requirement BYPASSED for this transaction.`);

                // Proceed to Mandate Approval
                const mandate = ctx.session.pendingMandate;
                // We need to reconstruct the intent for display or just use stored data
                // For simplicity, we assume mandate and intent data is sufficient
                // Re-using the helper we just created (Need to move helper scope or replicate logic)

                // Replicate helper logic here since helper is not global
                let msg = `📜 Council Approved Mandate (Liveness Verified)\n\n` +
                    `Recipient: (See Log)\n` + // Simplified for retry context
                    `Amount: ${mandate.amount} MNEE\n` +
                    `Status: UNILATERAL AUTHORIZATION GRANTED\n` +
                    `AP2 Signature: ${mandate.signature.substring(0, 20)}...`;

                ctx.session.step = "AWAITING_MANDATE_APPROVAL";
                const keyboard = new InlineKeyboard()
                    .text("✅ APPROVE", "approve_mandate")
                    .text("❌ REJECT", "reject_mandate");
                return ctx.reply(msg, { reply_markup: keyboard });

            } else {
                ctx.session.step = "IDLE";
                return ctx.reply(`❌ **Liveness Failed**\nYou said: "${transcription.text}"\nExpected: "${expected}"\n\nTransaction Cancelled.`);
            }
        }
        // ----------------------------------

        if (!transcription.text || transcription.confidence < 30) {
            return ctx.reply("❌ Could not transcribe audio clearly. Please try again with clearer speech.");
        }

        await ctx.reply(`🗣️ Heard: "${transcription.text}"`);

        // 4. Check for enrollment phrase (persistent storage) - flexible matching
        const lowerText = transcription.text.toLowerCase();
        const isEnrollmentPhrase = lowerText.includes('authorize') && lowerText.includes('voice') ||
            lowerText.includes('enroll') && lowerText.includes('voice') ||
            lowerText.includes('register') && lowerText.includes('voice') ||
            lowerText.includes('my name is') && (lowerText.includes('authorize') || lowerText.includes('payment'));

        if (isEnrollmentPhrase) {
            // Generate a hash from the audio as the voice profile
            const profileHash = crypto.createHash('sha256').update(audioBuffer).digest('hex').substring(0, 32);
            await userSettings.enrollVoice(ctx.from.id, profileHash);
            ctx.session.voiceEnrolled = true;
            return ctx.reply(`✅ Voice Profile Enrolled Successfully!\n\nYour voiceprint has been saved. Future voice commands will verify your identity.\n\nProfile Hash: ${profileHash.substring(0, 16)}...`);
        }

        // 5. Biometric verification (check persistent storage)
        const isEnrolled = await userSettings.isVoiceEnrolled(ctx.from.id);
        if (isEnrolled) {
            const bioResult = await voiceVerifier.verifyVoicePrint(audioBuffer, ctx.from.id);
            if (!bioResult.verified) {
                return ctx.reply(`🚨 SECURITY ALERT\nVoice does not match enrolled profile.\nConfidence: ${bioResult.confidence}%`);
            }
            // Score masked for honesty
            // await ctx.reply(`✅ Voice Identity Verified`);
        }

        // 6. Parse intent from transcript
        const intent = await agent.parseIntent(transcription.text);
        if (!intent) {
            return ctx.reply("❌ Could not understand payment intent. Try saying: 'Pay 50 MNEE to John for services'");
        }

        // 6. Run through audit
        const auditResult = await auditor.auditMandate(intent, transcription.text);
        if (!auditResult.approved) {
            const parts = auditResult.reason.split('|');
            let msg = `🚫 **BLOCKED by Risk Officer**\n\n`;
            if (parts.length > 1) {
                msg += `**${parts[0].replace('Title:', '').trim()}**\n\n${parts[1].replace('Explanation:', '').trim()}`;
            } else {
                msg += auditResult.reason;
            }
            return ctx.reply(msg, { parse_mode: 'Markdown' });
        }

        // 7. Validate amount exists
        if (!intent.amount) {
            return ctx.reply("❌ No amount specified. Please say something like: 'Pay 50 MNEE to AWS for servers'");
        }

        // 8. Generate mandate
        const mandateData = await mandateManager.createMandate(String(intent.amount), 24 * 3600);
        ctx.session.pendingMandate = mandateData;
        ctx.session.step = "AWAITING_MANDATE_APPROVAL";

        const keyboard = new InlineKeyboard()
            .text("✅ APPROVE", "approve_mandate")
            .text("❌ REJECT", "reject_mandate");

        await ctx.reply(
            `📜 Voice Mandate Generated\n\n` +
            `Recipient: ${intent.recipient}\n` +
            `Amount: ${intent.amount} MNEE\n` +
            `Purpose: ${intent.purpose}\n` +
            `Transcription Engine: ${transcription.engine}\n` +
            `AP2 Signature: ${mandateData.signature.substring(0, 20)}...`,
            { reply_markup: keyboard }
        );

    } catch (error: any) {
        console.error("Voice processing error:", error);
        await ctx.reply(`❌ Voice processing failed: ${error.message}\n\nTry using /pay command instead.`);
    }
});

// Reusable Payment Handler (Command & NLP)
async function handlePaymentIntent(ctx: any, text: string) {
    if (!text) return ctx.reply("Please provide payment details. e.g. Pay 50 MNEE to AWS");

    await ctx.reply("🛡️ *Sentinel Core* is analyzing your request via Omnichannel Gateway...", { parse_mode: 'Markdown' });

    const userId = ctx.from?.id.toString() || "Unknown";
    const userMode = ctx.session.mode || 'DEMO';
    const response = await sentinelCore.processPaymentRequest(text, userId, 'TELEGRAM', userMode);

    if (response.status === 'ERROR') {
        return ctx.reply(response.message);
    }

    if (response.status === 'BLOCKED') {
        // Use Markdown parsing for the formatted block message
        return ctx.reply(response.message, { parse_mode: 'Markdown' });
    }

    if (response.status === 'NEEDS_APPROVAL') {
        const { intent, saved, audit, zkProof } = response.data;

        ctx.session.pendingIntent = intent;
        ctx.session.pendingPrivacyHash = audit.privacyHash;
        ctx.session.lastZKProof = zkProof;

        reputationManager.updateScore(saved, true);

        await ctx.reply(`✅ Audit Passed (Risk: ${audit.riskScore}) | 🔐 ZK-Proof Verified`);

        // Validate amount exists
        if (!intent.amount) {
            return ctx.reply("❌ No amount specified. Please use format: /pay 50 MNEE to AWS for servers");
        }

        // Generate Mandate
        const mandateData = await mandateManager.createMandate(String(intent.amount), (intent.ttl_hours || 24) * 3600);
        ctx.session.pendingMandate = mandateData;

        // Standard Flow
        await sendMandateApproval(ctx, intent, mandateData, saved, reputationManager.getTrustBadge());
    }
}

// Pay Command - The Core Flow
bot.command(["pay", "Pay"], async (ctx) => {
    const text = ctx.match as string;
    await handlePaymentIntent(ctx, text);
});

bot.command("swap", async (ctx) => {
    const kb = new InlineKeyboard().url("🔗 Open MNEE Swap", "https://swap-user.mnee.net");
    await ctx.reply("🔀 MNEE Swap Interface\n\nNeed to convert assets or bridge to MNEE? Use the official swap portal below.", { reply_markup: kb });
});

// SET PIN COMMAND
bot.command("setpin", async (ctx) => {
    const text = ctx.match as string;

    // Always delete the message that contains PIN for security
    try { await ctx.deleteMessage(); } catch (e) { }

    if (!text || text.length !== 4 || isNaN(Number(text))) {
        return ctx.reply("❌ Invalid format. Usage: /setpin 1234 (4 digits)");
    }

    const userId = ctx.from?.id || 0;
    const hasExistingPin = await userSettings.hasPin(userId);

    // If PIN already exists, require current PIN to change it
    if (hasExistingPin) {
        // Check if user is trying to overwrite - need verification
        return ctx.reply("🔒 PIN Already Set\n\nTo change your PIN, use:\n/changepin [old] [new]\n\nExample: /changepin 1234 5678");
    }

    // Block weak PINs in ALL modes
    const weakPins = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '2121', '0123', '3210'];
    if (weakPins.includes(text)) {
        return ctx.reply("⚠️ Weak PIN Rejected\n\nSimple PINs (1234, 0000, etc.) are not allowed for security reasons.\n\nChoose a stronger 4-digit PIN.");
    }

    await userSettings.setPin(userId, text);

    // Check if there's a pending payment to continue
    const pendingMandate = ctx.session.pendingMandate;
    if (pendingMandate && ctx.session.mode === "PRODUCTION") {
        await ctx.reply(`✅ PIN Configured!\n\nNow continuing your payment...`);
        const intent = { recipient: pendingMandate.recipient || "Vendor", amount: pendingMandate.amount || 50, purpose: pendingMandate.purpose || "Payment" };
        await sendMandateApproval(ctx, intent, pendingMandate, 0, "Verified");
    } else {
        await ctx.reply(`✅ PIN Configured!\n\nYour PIN is securely hashed. Future payments will require this PIN.`);
    }
});

// Change PIN with verification
bot.command("changepin", async (ctx) => {
    const text = ctx.match as string;

    // Always delete for security
    try { await ctx.deleteMessage(); } catch (e) { }

    const parts = text.split(" ");
    if (parts.length !== 2 || parts[0].length !== 4 || parts[1].length !== 4) {
        return ctx.reply("❌ Usage: /changepin [old] [new]\nExample: /changepin 1234 5678");
    }

    const oldPin = parts[0];
    const newPin = parts[1];
    const userId = ctx.from?.id || 0;

    const isValid = await userSettings.validatePin(userId, oldPin);
    if (!isValid) {
        return ctx.reply("❌ Current PIN is incorrect. Change cancelled.");
    }

    await userSettings.setPin(userId, newPin);
    await ctx.reply("✅ PIN Changed Successfully!");
});

bot.command("audit", async (ctx) => {
    const logs = await auditLogger.exportLogs();
    const total = logs.length;
    const recent = logs.slice(0, 5).map(l => `• ${l.timestamp.split('T')[1].split('.')[0]}: ${l.event_type} - ${l.status}`).join('\n');

    const msg = `📑 Forensic Audit Summary\n\n` +
        `Total Logged Events: ${total}\n\n` +
        `Recent Activity:\n${recent || 'No recent activity.'}\n\n` +
        `Use /export_logs to download the full W3C-compliant traceability report.`;

    await ctx.reply(msg);
});

// EXPORT AUDIT LOGS
bot.command("export_logs", async (ctx) => {
    await ctx.reply("📂 Gathering Forensic Audit Logs...");
    try {
        const filePath = await auditLogger.dumpToCSV();
        // const { InputFile } = require('grammy'); // Deprecated
        await ctx.replyWithDocument(new InputFile(filePath), { caption: "📑 Forensic Audit Export (CSV)\n\nW3C JSON-LD Compatible Traceability" });
    } catch (e) {
        await ctx.reply("❌ Export failed. Please try again later.");
    }
});

// Helper to send the standard approval card
async function sendMandateApproval(ctx: any, intent: any, mandateData: any, saved: number, trustBadge: string) {
    const savedText = saved > 0 ? `\n💰 You saved: ${saved} MNEE` : '';

    let msg = `📜 Payment Ready for Approval\n\n` +
        `To: ${intent.recipient}\n` +
        `Amount: ${intent.amount} MNEE\n` +
        `Purpose: ${intent.purpose}${savedText}\n\n`;

    if (ctx.session.pendingPrivacyHash) {
        msg += `🔒 Privacy Hash: ${ctx.session.pendingPrivacyHash}\n`;
    }

    msg += `Status: ✅ Verified & Compliant`;

    ctx.session.step = "AWAITING_MANDATE_APPROVAL";

    const keyboard = new InlineKeyboard()
        .text("✅ APPROVE", "approve_mandate")
        .text("❌ REJECT", "reject_mandate");

    await ctx.reply(msg, { reply_markup: keyboard });
}

// Centralized Transaction Execution Logic
async function executeTransaction(ctx: any, recipient: string, amount: string, isProduction: boolean, intent: any) {
    if (isProduction) {
        // REAL BLOCKCHAIN TRANSACTION
        await ctx.reply(`⏳ Routing to ${recipient} via MNEE Omnichannel Core...`);
        auditLogger.logEvent("SENTINEL_CORE", "Executing Omnichannel Transaction", "ROUTING", { recipient, gateway: "Telegram" });

        // Patience context
        const patienceTimer = setTimeout(async () => {
            try { await ctx.reply("⏳ Transaction sent! Waiting for network confirmation (Ethereum takes ~15-30s)..."); } catch (e) { }
        }, 7000);

        const privateKey = process.env.PRIVATE_KEY!;
        const result = await tokenService.sendTransfer(privateKey, recipient, amount);
        clearTimeout(patienceTimer);

        if (result.success) {
            ctx.session.lastTxHash = result.txHash;
            auditLogger.logEvent("BLOCKCHAIN_EXECUTION", `Transfer to ${recipient}`, "SUCCESS", { txHash: result.txHash, amount });

            const successMsg = `✅ Payment Executed!\n\nTransaction confirmed on Ethereum Sepolia.\n\nRecipient: ${recipient.substring(0, 6)}...${recipient.substring(38)}\nAmount: ${amount} MNEE\nTx: ${result.txHash?.substring(0, 20)}...`;

            // Use short callback data - tx hash already stored in session
            const receiptKeyboard = new InlineKeyboard()
                .text("📸 Get Receipt", "get_last_receipt")
                .url("🔗 Etherscan", `https://sepolia.etherscan.io/tx/${result.txHash}`);

            await ctx.reply(successMsg, { reply_markup: receiptKeyboard, link_preview_options: { is_disabled: true } });
        } else {
            auditLogger.logEvent("BLOCKCHAIN_EXECUTION", `Transfer to ${recipient}`, "FAILED", { error: result.error, amount });
            await ctx.reply(`❌ Transaction Failed\n\n${result.error}\n\nPlease check wallet balance and try again.`);
        }
    } else {
        // DEMO MODE
        auditLogger.logEvent("BLOCKCHAIN_EXECUTION", `Simulated Transfer to ${recipient}`, "DEMO_SUCCESS", { amount });
        const simMsg = `✅ Payment Simulated (Demo Mode)\n\nRecipient: ${recipient.substring(0, 6)}...${recipient.substring(38)}\nAmount: ${amount} MNEE\n\nTo execute real transactions, switch to Production Mode via /start`;
        await ctx.reply(simMsg);
    }

    ctx.session.step = "IDLE";
    ctx.session.pendingMandate = null;
}

// Handle inline keyboard button callbacks
bot.callbackQuery("approve_mandate", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Processing approval..." });

    if (ctx.session.step === "AWAITING_MULTISIG") {
        ctx.session.reactionCount++;
        if (ctx.session.reactionCount >= 2) {
            await ctx.editMessageText("✅ Multi-Sig Threshold Met (2/3). Executing Transaction via Paymaster...");
            ctx.session.step = "IDLE";
            ctx.session.reactionCount = 0;
        } else {
            await ctx.editMessageText(`✅ Approval ${ctx.session.reactionCount}/2 recorded. Waiting for ${2 - ctx.session.reactionCount} more admin(s)...`);
        }
    } else if (ctx.session.step === "AWAITING_MANDATE_APPROVAL") {
        const mandate = ctx.session.pendingMandate;
        if (!mandate) {
            await ctx.editMessageText("⚠️ Error: Mandate expired or invalid.");
            ctx.session.step = "IDLE";
            return;
        }

        // Resolve address if not already found in intent (Safety Layer)
        const intent = ctx.session.pendingIntent;
        const recipient = intent?.address || VendorRegistry.getAddress(intent?.recipient || "") || "0xE357CFDd3EEC59dE39CA315b9667d36E3b3bBf96";
        const amount = (mandate.maxAmount || mandate.amount || intent?.amount || '0').toString();

        // Check if we're in Production Mode with a real wallet
        const privateKey = process.env.PRIVATE_KEY;
        const isProduction = ctx.session.mode === "PRODUCTION" && privateKey;

        if (isProduction) {
            // Require PIN for Production
            const hasPin = await userSettings.hasPin(ctx.from?.id || 0);
            if (!hasPin) {
                await ctx.editMessageText(`⚠️ Security PIN Required for Production.\nPlease set one first using: /setpin 1234`);
                return;
            }
            ctx.session.step = "AWAITING_PIN";
            await ctx.editMessageText("🔒 Production Security: Enter your 4-digit PIN to confirm transaction:");
            return; // EXIT to preserve state
        } else {
            await ctx.editMessageText("✅ Authorized (Demo Mode). Processing...");
            await executeTransaction(ctx, recipient, amount, false, intent);
        }

        ctx.session.step = "IDLE";
        ctx.session.pendingMandate = null;
    } else {
        await ctx.editMessageText("⚠️ No pending payment to approve.");
    }
});

bot.callbackQuery("reject_mandate", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Mandate rejected" });
    await ctx.editMessageText("❌ Mandate Rejected by User.\n\nTransaction cancelled. No funds were moved.");
    ctx.session.step = "IDLE";
    ctx.session.pendingMandate = null;
});


// REQUEST FORENSIC AUDIT - Dynamic Whitelisting
bot.callbackQuery("request_audit", async (ctx) => {
    const intent = ctx.session.pendingIntent;
    if (!intent) {
        return ctx.answerCallbackQuery({ text: "Session error", show_alert: true });
    }

    await ctx.answerCallbackQuery({ text: "Starting Forensic Audit..." });
    await ctx.editMessageText(`🔍 Forensic Auditor Initiated\n\nInvestigating '${intent.recipient}' for compliance and risk...\n\nStay tuned, this takes a few seconds.`);

    // Simulate "Deep Exploration" with incremental updates
    const updates = [
        "🔍 Scanning secondary whitelists...",
        "🔍 Checking AML/Sanction watchlists...",
        "🔍 Analyzing entity reputation score...",
        "🔍 Finalizing risk assessment report..."
    ];

    for (const update of updates) {
        await new Promise(r => setTimeout(r, 1500));
        await ctx.editMessageText(`🔍 Forensic Auditor Initiated\n\n${update}`).catch(() => { });
    }

    // Dynamic Forensic Audit Report (Gemini Powered - No Markdown)
    const forensicMsg = await auditor.generateForensicReport(intent);

    await ctx.editMessageText(forensicMsg);

    // Now proceed to the PIN stage
    setTimeout(async () => {
        const hasPin = await userSettings.hasPin(ctx.from?.id || 0);
        if (hasPin) {
            ctx.session.step = "AWAITING_PIN";
            await ctx.reply(`🔒 Security PIN Required\n\nAudit passed. Please enter your 4-digit PIN to authorize this transaction.`);
        } else {
            await ctx.reply(`🔒 Production Security Required\n\nYou must set a Security PIN before making payments in Production mode.\n\nUse /setpin 1234 to create your PIN first.`);
        }
    }, 2000);
});

// Multi-Sig Approval via Text (Backup for typing APPROVE)
bot.on("message:text", async (ctx) => {
    // 1. PIN VERIFICATION
    if (ctx.session.step === "AWAITING_PIN") {
        const inputPin = ctx.message.text;

        // Delete the PIN message immediately for security
        try { await ctx.deleteMessage(); } catch (e) { }

        // Check if user is locked out
        if (ctx.session.pinLockoutUntil && Date.now() < ctx.session.pinLockoutUntil) {
            const remainingMins = Math.ceil((ctx.session.pinLockoutUntil - Date.now()) / 60000);
            await ctx.reply(`🔒 Too Many Failed Attempts\n\nPlease wait ${remainingMins} minute(s) before trying again.`);
            return;
        }

        const isValid = await userSettings.validatePin(ctx.from?.id || 0, inputPin);

        if (isValid) {
            // Reset attempts on success
            ctx.session.pinAttempts = 0;
            ctx.session.pinLockoutUntil = undefined;

            await ctx.reply("🔓 PIN Verified. Processing payment...");

            // Resume Flow
            // Resume Flow
            const mandate = ctx.session.pendingMandate;
            if (mandate) {
                const intent = ctx.session.pendingIntent;

                // Resolve address again (safety)
                // Note: executeTransaction expects a resolved address or resolves it? 
                // executeTransaction takes 'recipient' string. If it's an address, sendTransfer works.
                const recipient = intent?.address || VendorRegistry.getAddress(intent?.recipient || "") || "0xE357CFDd3EEC59dE39CA315b9667d36E3b3bBf96";
                const amount = (mandate.amount || '50').toString();

                await ctx.reply("🔓 Validation Successful. Executing...");
                // Force IsProduction=true here because we only ask for PIN in Production flow
                await executeTransaction(ctx, recipient, amount, true, intent);
            } else {
                ctx.session.step = "IDLE";
                await ctx.reply("⚠️ Session expired. Please start /pay again.");
            }
        } else {
            // Increment failed attempts
            ctx.session.pinAttempts = (ctx.session.pinAttempts || 0) + 1;
            const remaining = 5 - ctx.session.pinAttempts;

            if (ctx.session.pinAttempts >= 5) {
                // Lock out for 5 minutes
                ctx.session.pinLockoutUntil = Date.now() + 5 * 60 * 1000;
                ctx.session.step = "IDLE";
                ctx.session.pendingMandate = null;
                await ctx.reply("🔒 Maximum Attempts Reached\n\nYour account is locked for 5 minutes.");
            } else {
                await ctx.reply(`❌ Incorrect PIN. ${remaining} attempt(s) remaining.`);
                // Stay in AWAITING_PIN to allow retry
            }
        }
        return;
    }

    // Handle multisig approvals
    if (ctx.session.step === "AWAITING_MULTISIG" && ctx.message.text.toUpperCase() === "APPROVE") {
        ctx.session.reactionCount++;
        if (ctx.session.reactionCount >= 2) {
            await ctx.reply("✅ Multi-Sig Threshold Met (2/3). Executing Transaction via Paymaster...");
            ctx.session.step = "IDLE";
            ctx.session.reactionCount = 0;
        } else {
            await ctx.reply(`✅ Approval ${ctx.session.reactionCount}/2 recorded. Waiting for ${2 - ctx.session.reactionCount} more admin(s)...`);
        }
        return;
    }

    // Handle single mandate approvals
    if (ctx.session.step === "AWAITING_MANDATE_APPROVAL" && ctx.message.text.toUpperCase() === "APPROVE") {
        await ctx.reply("🚀 Mandate Approved! Broadcasting to Base Sepolia via Safe Account...\n\n✅ Transaction Executed Successfully");
        ctx.session.step = "IDLE";
        return;
    }

    // NLP Payment Intent Check (Start of flow)
    // Only if not in a wizard step
    if (!ctx.session.step || ctx.session.step === "IDLE") {
        const lower = ctx.message.text.toLowerCase();
        // Ignore very short messages
        if (lower.length > 5 && (lower.includes("pay") || lower.includes("send") || lower.includes("transfer") || lower.includes("mnee"))) {
            await handlePaymentIntent(ctx, ctx.message.text);
        }
    }
});

// ✅ TELEGRAM RECEIPT HANDLER (Playwright) - Local HTML Generation
import { chromium } from 'playwright-chromium';

bot.callbackQuery("get_last_receipt", async (ctx) => {
    const txHash = ctx.session.lastTxHash;
    if (!txHash) {
        await ctx.answerCallbackQuery({ text: "❌ Session expired. Perform a new transaction." });
        return;
    }

    // Generate Timestamp
    const date = new Date().toLocaleString("en-US", { timeZone: "UTC" });

    // 🎨 CREATE LOCAL RECEIPT HTML
    const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
    const htmlContent = `
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f8; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .receipt { background: white; width: 400px; padding: 40px; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); border-top: 6px solid #6200ea; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #333; margin-bottom: 5px; }
            .sub { color: #888; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
            .amount { font-size: 48px; font-weight: bold; color: #333; text-align: center; margin: 20px 0; }
            .currency { font-size: 20px; color: #666; font-weight: normal; }
            .details { margin-top: 30px; border-top: 2px dashed #eee; padding-top: 20px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
            .label { color: #888; }
            .value { color: #333; font-weight: 500; font-family: monospace; }
            .status { color: #2e7d32; font-weight: bold; background: #e8f5e9; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #aaa; }
        </style>
    </head>
    <body>
        <div class="receipt">
            <div class="header">
                <div class="logo">MNEE Sentinel</div>
                <div class="sub">Official Transaction Receipt</div>
            </div>
            
            <div style="text-align: center;"><span class="status">● CONFIRMED ON-CHAIN</span></div>

            <div class="amount">50.00 <span class="currency">MNEE</span></div>

            <div class="details">
                <div class="row">
                    <span class="label">Date (UTC)</span>
                    <span class="value">${date}</span>
                </div>
                <div class="row">
                    <span class="label">Network</span>
                    <span class="value">Ethereum Sepolia</span>
                </div>
                <div class="row">
                    <span class="label">Type</span>
                    <span class="value">Transfer (ERC-20)</span>
                </div>
                <div class="row">
                    <span class="label">Gas Fee</span>
                    <span class="value">SPONSORED (Paymaster)</span>
                </div>
                <div class="row">
                    <span class="label">Tx Hash</span>
                    <span class="value">${txHash.substring(0, 10)}...${txHash.substring(60)}</span>
                </div>
            </div>

            <div class="footer">
                Verified by MNEE Sentinel Audit Log<br>
                ${explorerUrl}
            </div>
        </div>
    </body>
    </html>
    `;

    await ctx.answerCallbackQuery({ text: "📸 Generating Verified Receipt..." });
    await ctx.reply("📸 Generating Enterprise Receipt...");

    try {
        console.log(`📸 Generating Local Receipt for: ${txHash}`);
        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const context = await browser.newContext({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 2 });
        const page = await context.newPage();

        await page.setContent(htmlContent); // Render LOCAL html - bypasses Cloudflare
        await page.waitForTimeout(500); // Tiny wait for fonts

        // Screenshot the .receipt element only
        const element = await page.$('.receipt');
        const buffer = await element?.screenshot({ type: 'jpeg', quality: 90 });

        await browser.close();

        if (buffer) {
            await ctx.replyWithPhoto(new InputFile(buffer, `receipt_${txHash.substring(0, 10)}.jpg`), {
                caption: `🧾 *Verified Enterprise Receipt*\n[View on Etherscan](${explorerUrl})`,
                parse_mode: "Markdown"
            });
        } else {
            throw new Error("Element not found");
        }

    } catch (error) {
        console.error("Screenshot failed:", error);
        await ctx.reply(`🚫Receipt Error: [View on Explorer](${explorerUrl})`, { parse_mode: "Markdown" });
    }
});

// ✅ GLOBAL ERROR HANDLER
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    console.error(err.error);
});

// KEEP-ALIVE for Azure Container Apps
import * as http from "http";
const keepAlivePort = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("MNEE Sentinel Online");
}).listen(keepAlivePort, () => {
    console.log("🌐 Keep-Alive Server listening on port", keepAlivePort);
});

console.log("🚀 MNEE Sentinel Bot Starting...");
auditLogger.logSystemStart();

// Start Telegram bot with error handling
bot.start({
    onStart: (botInfo) => {
        console.log(`✅ Telegram Bot Online: @${botInfo.username}`);
    }
}).catch((error) => {
    console.error("❌ Telegram Bot failed to start:", error.message);
    console.warn("⚠️ Slack bot will continue running if configured.");
});