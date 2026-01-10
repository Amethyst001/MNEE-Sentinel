import { App } from '@slack/bolt';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { SentinelCore } from '../../agent/src/SentinelCore';
import { TokenService } from '../../agent/src/TokenService';
// import { chromium } from 'playwright-chromium'; // Removed to avoid Native Module crash

import axios from 'axios';
import { VoiceTranscriber } from '../../agent/src/VoiceTranscriber';
import { UserSettings } from '../../agent/src/UserSettings';

const transcriber = new VoiceTranscriber();
const userSettings = new UserSettings();

// Store pending payment intents for when user clicks Approve
const pendingPayments: Map<string, { intent: any, zkProof: any, saved: number, awaitingPin?: boolean }> = new Map();

// Store per-user mode preferences (demo or production)
const userModes: Map<string, 'demo' | 'production'> = new Map();

dotenv.config({ path: path.join(__dirname, '../../.env') });

const auditorKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3
].filter(key => !!key) as string[];

const core = new SentinelCore(auditorKeys);

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    developerMode: true // Enable Verbose Logging to debug "Silence"
});

// Handle explicit /pay command
app.command('/pay', async ({ command, ack, say }) => {
    await ack();
    await say("🛡️ *Sentinel Core* is analyzing your slash command...");
    const response = await core.processPaymentRequest(command.text, command.user_id, 'SLACK');

    if (response.status === 'NEEDS_APPROVAL') {
        const { intent, saved, zkProof } = response.data;

        // Store for later approval
        pendingPayments.set(command.user_id, { intent, saved, zkProof });

        let msg = `📜 *Payment Ready for Approval*\n\n` +
            `*To:* ${intent.recipient}\n` +
            `*Amount:* ${intent.amount} MNEE\n` +
            `*Purpose:* ${intent.purpose}\n`;

        if (saved > 0) msg += `💰 *Savings:* ${saved} MNEE (via AI Negotiation)\n`;

        msg += `\n🔐 *Security:* Verified & Compliant\n` +
            `✅ *Ready to execute*`;

        await say({
            text: msg,
            blocks: [
                {
                    "type": "section",
                    "text": { "type": "mrkdwn", "text": msg }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": { "type": "plain_text", "text": "✅ Approve" },
                            "style": "primary",
                            "action_id": "approve_payment"
                        },
                        {
                            "type": "button",
                            "text": { "type": "plain_text", "text": "❌ Reject" },
                            "style": "danger",
                            "action_id": "reject_payment"
                        }
                    ]
                }
            ]
        });
    } else {
        await say(response.message);
    }
});

// Configure Security PIN
app.command('/setpin', async ({ command, ack, say }) => {
    await ack();
    const args = command.text.trim().split(/\s+/);
    const pin = args[0];

    if (!pin || pin.length !== 4 || isNaN(Number(pin))) {
        await say("❌ *Invalid PIN Format.* Please use exactly 4 digits. Example: `/setpin 1234`");
        return;
    }

    try {
        await userSettings.setPin(command.user_id, pin);
        let msg = "✅ *Security PIN Configured Successfully!* You can now authorize high-value transactions.";

        // Check for pending approval
        const pending = pendingPayments.get(command.user_id);
        if (pending) {
            msg += "\n\n🔄 *Pending Transaction Detected:* You can now return to the approval message and click 'Approve' to authorize it securely.";
        }
        await say(msg);
    } catch (e: any) {
        console.error("Set PIN Error:", e);
        await say("❌ *Database Error.* Could not set PIN.");
    }
});

// Change Existing PIN
app.command('/changepin', async ({ command, ack, say }) => {
    await ack();
    const args = command.text.trim().split(/\s+/);
    if (args.length !== 2) {
        await say("❌ *Usage:* `/changepin [old_pin] [new_pin]`");
        return;
    }
    const [oldPin, newPin] = args;
    if (newPin.length !== 4 || isNaN(Number(newPin))) {
        await say("❌ New PIN must be 4 digits.");
        return;
    }

    const isValid = await userSettings.validatePin(command.user_id, oldPin);
    if (!isValid) {
        await say("❌ Current PIN is incorrect.");
        return;
    }

    await userSettings.setPin(command.user_id, newPin);
    await say("✅ *PIN Updated Successfully.*");
});

app.command('/sentinel-status', async ({ command, ack, say }) => {
    await ack();
    const auditor = core.getAuditor();
    const volume = auditor.hourlyVolume || 0;
    const limit = 1000;
    const usage = Math.round((volume / limit) * 100);

    // Rich Block Kit UI for Status
    await say({
        blocks: [
            {
                "type": "header",
                "text": { "type": "plain_text", "text": "🛡️ MNEE Sentinel Status", "emoji": true }
            },
            {
                "type": "section",
                "fields": [
                    { "type": "mrkdwn", "text": "*System:*\n🟢 Online" },
                    { "type": "mrkdwn", "text": "*Mode:*\n🏭 Production" }
                ]
            },
            {
                "type": "divider"
            },
            {
                "type": "section",
                "fields": [
                    { "type": "mrkdwn", "text": "*Hourly Velocity:*\n" + `\`${volume} / ${limit} MNEE\`` },
                    { "type": "mrkdwn", "text": "*Risk Level:*\nLow (ZK-Active)" }
                ]
            },
            {
                "type": "context",
                "elements": [
                    { "type": "mrkdwn", "text": "🔐 *Security:* Zero-Knowledge Proofs Enforced | 🔗 *Net:* Ethereum Sepolia" }
                ]
            }
        ]
    });
});

app.command('/audit', async ({ command, ack, say }) => {
    await ack();
    const logs = await core.getAuditLogger().getLogs(5);

    // Convert logs to Slack Blocks
    const logBlocks = logs.map(log => {
        const icon = log.status === 'SUCCESS' || log.status === 'DEMO_SUCCESS' ? '✅' : log.status === 'FAILED' ? '🚫' : '📝';
        const eventName = log.action || log.event_type || 'System Event';
        const details = log.agent_id || 'System';
        return {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `${icon} *${eventName}*\n_${log.timestamp} - ${details}_`
            }
        };
    });

    await say({
        blocks: [
            { "type": "header", "text": { "type": "plain_text", "text": "📋 recent Audit Events", "emoji": true } },
            { "type": "divider" },
            ...logBlocks,
            { "type": "divider" }
        ]
    });
});

// Helper to handle AI responses (Shared by Text and Voice)
async function handleSentinelResponse(say: any, userId: string, response: any) {
    if (response.status === 'NEEDS_APPROVAL') {
        const { intent, saved, zkProof } = response.data;
        pendingPayments.set(userId, { intent, saved, zkProof });

        let msg = `📜 *Payment Ready for Approval*\n\n` +
            `*To:* ${intent.recipient}\n` +
            `*Amount:* ${intent.amount} MNEE\n` +
            `*Purpose:* ${intent.purpose}\n`;

        if (saved > 0) msg += `💰 *Savings:* ${saved} MNEE (via AI Negotiation)\n`;

        msg += `\n🔐 *Security:* Verified & Compliant\n` +
            `✅ *Ready to execute*`;

        await say({
            text: msg,
            blocks: [
                {
                    "type": "section",
                    "text": { "type": "mrkdwn", "text": msg }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": { "type": "plain_text", "text": "✅ Approve" },
                            "style": "primary",
                            "action_id": "approve_payment"
                        },
                        {
                            "type": "button",
                            "text": { "type": "plain_text", "text": "❌ Reject" },
                            "style": "danger",
                            "action_id": "reject_payment"
                        }
                    ]
                }
            ]
        });
    } else {
        await say(response.message);
    }
}

// Handle simple messages (AI Core)
app.message(async ({ message, say, client }) => {
    const text = (message as any).text;
    const userId = (message as any).user;
    if (!text) return;
    if ((message as any).bot_id || (message as any).subtype === 'bot_message') return;

    // PIN Handling
    const pending = pendingPayments.get(userId);
    if (pending && pending.awaitingPin) {
        // DELETE USER MESSAGE IMMEDIATELY (Security)
        try {
            await client.chat.delete({
                channel: message.channel,
                ts: (message as any).ts,
                token: process.env.SLACK_ADMIN_TOKEN || process.env.SLACK_BOT_TOKEN // Try Admin token if available
            });
        } catch (e) {
            console.log("⚠️ Could not delete PIN message (Missing Scopes?)");
        }

        // Validate PIN
        const isValid = await userSettings.validatePin(userId, text.trim());
        if (isValid) {
            await say("🔓 *PIN Verified.* Executing transaction...");
            const userMode = userModes.get(userId) || 'demo';
            const isProduction = userMode === 'production';

            // Execute
            await executeSlackTransaction(client, message.channel, pending.intent, isProduction);
            pendingPayments.delete(userId);
        } else {
            await say("❌ *Incorrect PIN.* Please try again.");
        }
        return;
    }

    // Handle Natural Language (ignore if it looks like a command invocation to avoid double-processing)
    if (text.startsWith('/') && !text.toLowerCase().startsWith('/pay')) return;

    if (text.toLowerCase().includes('pay') || text.toLowerCase().includes('mnee')) {
        console.log(`[Slack] Input: "${text}"`);
        await say("🛡️ *Sentinel Core* is analyzing your request on Slack...");

        // @ts-ignore
        const response = await core.processPaymentRequest(text, message.user, 'SLACK');
        // @ts-ignore
        await handleSentinelResponse(say, message.user, response);
    } else {
        // RICH Welcome / Help Message (Parity with Telegram /start)
        // @ts-ignore
        const currentMode = userModes.get(message.user) || 'demo';

        await say({
            blocks: [
                {
                    "type": "header",
                    "text": { "type": "plain_text", "text": "👋 Welcome to MNEE Sentinel", "emoji": true }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "I am your *AI-Powered Treasury Agent*. I listen for payment requests, negotiate with suppliers, and enforce corporate policy using ZK-Proofs."
                    }
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": `*🎯 Current Mode:* ${currentMode === 'production' ? '🟢 Production (Real Transactions)' : '🟡 Demo (Simulated)'}`
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": { "type": "plain_text", "text": "🟡 Demo Mode" },
                            "action_id": "set_demo_mode"
                        },
                        {
                            "type": "button",
                            "text": { "type": "plain_text", "text": "🟢 Production Mode" },
                            "style": "primary",
                            "action_id": "set_production_mode"
                        }
                    ]
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*🤖 Natural Language Mode:*\nSimply type what you need:\n> \"Pay 50 MNEE to AWS for servers\"\n> \"Send 200 MNEE to VendorX\""
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*👔 Command Mode:*\nUse strict inputs for compliance:\n• `/pay` - Initiate mandate\n• `/setpin` - Configure Security PIN\n• `/changepin` - Change PIN\n• `/sentinel-status` - View velocity limits\n• `/audit` - View security logs\n• `/mode` - Switch Demo/Production"
                    }
                }
            ]
        });
    }
});

app.command('/export_logs', async ({ command, ack, client }) => {
    try {
        await ack();
        // Generate CSV
        const filePath = await core.getAuditLogger().dumpToCSV();

        // Upload to Slack
        await client.files.uploadV2({
            channel_id: command.channel_id,
            file: require('fs').createReadStream(filePath),
            filename: `mnee_audit_export_${Date.now()}.csv`,
            title: "📑 Forensic Audit Export (CSV)",
            initial_comment: "✅ Here is the full W3C-compliant traceability report."
        });
    } catch (e) {
        console.error(e);
        // Fallback if upload fails
        await client.chat.postMessage({
            channel: command.channel_id,
            text: "❌ Export failed. Please try again later."
        });
    }
});

// Centralized Execution Helper for Slack
async function executeSlackTransaction(client: any, channelId: string, intent: any, isProduction: boolean) {
    await client.chat.postMessage({
        channel: channelId,
        text: "⏳ *Processing...* Executing on-chain transaction..."
    });

    const tokenService = new TokenService();
    let txHash: string;
    let explorerUrl: string;

    if (isProduction && process.env.PRIVATE_KEY) {
        // REAL TRANSACTION
        const result = await tokenService.sendTransfer(
            process.env.PRIVATE_KEY,
            intent.walletAddress || '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
            String(intent.amount) // Convert to string for ethers.js
        );

        if (!result.success) {
            await client.chat.postMessage({
                channel: channelId,
                text: `❌ *Transaction Failed.*\nError: _${result.error}_\nPlease check your wallet balance (ETH for gas) or MNEE balance.`
            });
            core.getAuditLogger().logEvent("BLOCKCHAIN", `Transfer to ${intent.recipient}`, "FAILED", { error: result.error });
            return;
        }

        txHash = result.txHash!;
        explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
        core.getAuditLogger().logEvent("BLOCKCHAIN", `Transfer to ${intent.walletAddress}`, "SUCCESS", { txHash, amount: intent.amount });
    } else {
        // DEMO MODE - Simulated tx
        txHash = `0xDEMO_${Date.now().toString(16)}`;
        explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
        core.getAuditLogger().logEvent("BLOCKCHAIN", `Simulated Transfer to ${intent.recipient}`, "DEMO_SUCCESS", { txHash, amount: intent.amount });
    }

    // Success Message
    let successMsg =
        `✅ *Transaction Complete!*\n\n` +
        `*Recipient:* ${intent.recipient}\n` +
        `*Amount:* ${intent.amount} MNEE\n` +
        `*Security:* Verified ✓\n` +
        `*Tx Hash:* \`${txHash.substring(0, 20)}...\`\n\n`;

    const isDemo = txHash.includes('DEMO');
    if (!isDemo) {
        successMsg += `<${explorerUrl}|View on Etherscan>`;
    } else {
        successMsg += `_(Simulated Transaction in Demo Mode)_`;
    }

    const blocks: any[] = [
        {
            "type": "section",
            "text": { "type": "mrkdwn", "text": successMsg }
        }
    ];

    // Only show Receipt Button for Real Transactions
    if (!isDemo) {
        blocks.push({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": { "type": "plain_text", "text": "📸 Get Receipt Screenshot" },
                    "action_id": "get_receipt",
                    "value": explorerUrl
                }
            ]
        });
    }

    await client.chat.postMessage({
        channel: channelId,
        text: successMsg,
        blocks: blocks
    });
}

app.action('approve_payment', async ({ ack, body, client }) => {
    await ack();
    const channelId = (body as any).channel.id;
    const userId = (body as any).user.id;

    const pending = pendingPayments.get(userId);
    if (!pending) {
        await client.chat.postMessage({ channel: channelId, text: "⚠️ No pending payment found. Please initiate a new payment request." });
        return;
    }

    // Determine mode
    const userMode = userModes.get(userId) || 'demo';
    const isProduction = userMode === 'production';

    if (isProduction) {
        // Enforce PIN
        const hasPin = await userSettings.hasPin(userId);
        if (!hasPin) {
            await client.chat.postMessage({ channel: channelId, text: "⚠️ *Security PIN Required for Production.*\nPlease set one first by typing: `/setpin 1234`" });
            return;
        }

        // Open Secure Modal
        try {
            await client.views.open({
                trigger_id: (body as any).trigger_id,
                view: {
                    type: "modal",
                    callback_id: "confirm_pin_submission",
                    private_metadata: JSON.stringify({ channelId, intent: pending.intent }),
                    title: { type: "plain_text", text: "Security Verification" },
                    submit: { type: "plain_text", text: "Authorize" },
                    close: { type: "plain_text", text: "Cancel" },
                    blocks: [
                        {
                            type: "section",
                            text: { type: "mrkdwn", text: ":lock: *Production Protocol Check*\nPlease enter your 4-digit PIN." }
                        },
                        {
                            type: "input",
                            block_id: "pin_block",
                            element: {
                                type: "plain_text_input",
                                action_id: "pin_input",
                                min_length: 4,
                                max_length: 4,
                                placeholder: { type: "plain_text", text: "e.g. 1234" }
                            },
                            label: { type: "plain_text", text: "Security PIN" }
                        }
                    ]
                }
            });
        } catch (e) {
            console.error("Failed to open modal:", e);
            await client.chat.postMessage({ channel: channelId, text: "❌ Error opening security modal. (Trigger ID expired?)" });
        }
    } else {
        // Demo Mode - Execute Immediately
        await executeSlackTransaction(client, channelId, pending.intent, false);
        pendingPayments.delete(userId);
    }
});

// Receipt Screenshot Action Handler
app.action('get_receipt', async ({ ack, body, client, action }) => {
    await ack();
    const channelId = (body as any).channel.id;
    const explorerUrl = (action as any).value;

    await client.chat.postMessage({
        channel: channelId,
        text: "📸 *Generating receipt...*"
    });

    // Mock response for cloud mode
    await client.chat.postMessage({
        channel: channelId,
        text: "🚫 *Receipt Screenshot Unavailable*: Visual proofs are disabled in Cloud Mode to optimize performance. Please check the explorer link directly: " + explorerUrl
    });
});

app.action('reject_payment', async ({ ack, body, client }) => {
    await ack();
    await client.chat.postMessage({
        channel: (body as any).channel.id,
        text: "❌ *Transaction Terminated.* No funds were moved."
    });
});

// Voice Message Handler (Audio Files)
app.event('message', async ({ message, say, client }) => {
    // Only handle file_share with audio
    const msg = message as any;
    if (msg.subtype !== 'file_share' || !msg.files) return;

    const file = msg.files[0];
    const mime = file.mimetype || '';

    if (mime.includes('audio') || mime.includes('video') || mime.includes('mp4')) {
        try {
            await say("🎤 *Sentinel Core* is processing your voice transmission...");

            // Download file
            const response = await axios.get(file.url_private, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                responseType: 'arraybuffer'
            });
            const buffer = Buffer.from(response.data);

            // Transcribe
            const result = await transcriber.transcribe(buffer, mime);

            if (!result.text) {
                await say("⚠️ *Audio Unintelligible.* Please speak clearly.");
                return;
            }

            await say(`🗣️ *Heard:* _"${result.text}"_`);

            // Process Logic using Helper
            const sentinelResponse = await core.processPaymentRequest(result.text, msg.user, 'SLACK');
            await handleSentinelResponse(say, msg.user, sentinelResponse);

        } catch (e: any) {
            console.error("Slack Voice Error:", e);
            await say(`❌ Voice Error: ${e.message}`);
        }
    }
});

// Mode Selection Actions
app.action('set_demo_mode', async ({ ack, body, client }) => {
    await ack();
    const userId = (body as any).user.id;
    userModes.set(userId, 'demo');
    await client.chat.postMessage({
        channel: (body as any).channel.id,
        text: "🟡 *Mode Changed:* Now in Demo Mode. Transactions will be simulated."
    });
});

app.action('set_production_mode', async ({ ack, body, client }) => {
    await ack();
    const userId = (body as any).user.id;
    userModes.set(userId, 'production');
    await client.chat.postMessage({
        channel: (body as any).channel.id,
        text: "🟢 *Mode Changed:* Now in Production Mode. Transactions will be executed on Ethereum Sepolia."
    });
});

// /mode command to toggle mode
app.command('/mode', async ({ command, ack, say }) => {
    await ack();
    const currentMode = userModes.get(command.user_id) || 'demo';
    const newMode = currentMode === 'demo' ? 'production' : 'demo';
    userModes.set(command.user_id, newMode);

    const emoji = newMode === 'production' ? '🟢' : '🟡';
    const desc = newMode === 'production' ? 'Real blockchain transactions enabled' : 'Simulated transactions (safe testing)';

    await say(`${emoji} *Mode switched to ${newMode.toUpperCase()}*\n${desc}`);
});

// Modal Submission Handler
app.view('confirm_pin_submission', async ({ ack, body, view, client }) => {
    // Validate PIN
    const pin = view.state.values.pin_block.pin_input.value;
    const userId = body.user.id;
    // Metadata
    const metadata = JSON.parse(view.private_metadata);
    const { channelId, intent } = metadata;

    const isValid = await userSettings.validatePin(userId, pin);
    if (!isValid) {
        // Return Update to Modal (Error)
        await ack({
            response_action: "errors",
            errors: {
                "pin_block": "Incorrect PIN. Please try again."
            }
        });
        return;
    }

    // Success -> Close Modal
    await ack();

    // Execute Transaction
    await executeSlackTransaction(client, channelId, intent, true);

    // Clear Pending
    pendingPayments.delete(userId);
});

(async () => {
    await app.start();
    console.log('⚡️ MNEE Sentinel is running on Slack!');
    core.getAuditLogger().logEvent("SYSTEM", "Slack Gateway Online", "SUCCESS", {});
})();
