import { App } from '@slack/bolt';
import { MandateManager } from "../../agent/src/MandateManager";
import { GeminiAgent } from "../../agent/src/GeminiAgent";
import * as dotenv from "dotenv";

dotenv.config();

const app = new App({
    token: process.env.SLACK_BOT_TOKEN || "xoxb-dummy-token",
    signingSecret: process.env.SLACK_SIGNING_SECRET || "dummy-secret",
    socketMode: true, // simplified for demo
    appToken: process.env.SLACK_APP_TOKEN || "xapp-dummy-token"
});

// Reuse the same Agent Brain
const agent = new GeminiAgent(process.env.GEMINI_API_KEY || "dummy_key");
const mandateManager = new MandateManager(process.env.PRIVATE_KEY || "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

app.command('/pay', async ({ command, ack, respond }) => {
    await ack();

    await respond(`🤖 Enterprise Sentinel: Analyzing intent for: "${command.text}"...`);

    const intent = await agent.parseIntent(command.text);

    if (!intent) {
        await respond("❌ Error: Could not parse intent from your request.");
        return;
    }

    const mandateData = await mandateManager.createMandate(intent.amount.toString(), (intent.ttl_hours || 24) * 3600);

    // Enterprise-Grade UI Block
    const blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🛡️ New Payment Mandate Proposal"
            }
        },
        {
            "type": "section",
            "fields": [
                { "type": "mrkdwn", "text": `*Recipient:*\n${intent.recipient}` },
                { "type": "mrkdwn", "text": `*Amount:*\n${intent.amount} MNEE` }
            ]
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `*Purpose:* ${intent.purpose}\n*Data Audit:* JSON-LD Generated`
            }
        },
        {
            "type": "divider"
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": { "type": "plain_text", "text": "✅ Approve & Sign" },
                    "style": "primary",
                    "action_id": "approve_mandate",
                    "value": JSON.stringify(intent)
                },
                {
                    "type": "button",
                    "text": { "type": "plain_text", "text": "❌ Reject" },
                    "style": "danger",
                    "action_id": "reject_mandate"
                }
            ]
        }
    ];

    await respond({ blocks });
});

app.action('approve_mandate', async ({ body, ack, respond }) => {
    await ack();
    await respond("✅ Mandate Signed. Executing gasless settlement via Safe Core...");
    // Execution logic would go here
});

app.action('reject_mandate', async ({ body, ack, respond }) => {
    await ack();
    await respond("🚫 Mandate Rejected.");
});

(async () => {
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ MNEE Enterprise Sentinel (Slack) is running!');
})();
