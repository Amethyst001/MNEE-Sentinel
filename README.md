# MNEE Sentinel

**MNEE Sentinel solves the $2T B2B trust gap by moving from human-initiated payments to verifiable agentic mandates. It is the first 'Treasury-in-a-Box' that uses ZK-proofs to ensure payment only follows performance, gaslessly.**

---

MNEE Sentinel is an autonomous B2B Agentic Treasury and Escrow system. It allows businesses (via **Telegram and Slack**) to authorize an AI Agent to negotiate, verify, and settle payments for digital services using the **MNEE Stablecoin** without manual gas management or trust-gap risks.

## 🏆 Key Features

### 1. Enterprise Audit Logger
Every transaction generates a signed JSON-LD metadata file containing the LLM prompt, ZK-proofs, and the on-chain TxID. This ensures full corporate compliance and a verifiable audit trail.

### 2. Intent-Based Mandates
Leveraging **AP2 (Agent Payment Protocol)**, the Agent cannot move money without a cryptographically signed "Intent Mandate" that includes a strict Time-to-Live (TTL). Security is baked into the protocol, not just the code.

## 🏆 The 9 Pillars of Complexity
We didn't just build a bot. We built a **Financial Operating System** for the Agentic Economy.

| Pillar | Tech | Description |
| :--- | :--- | :--- |
| **1. Adversarial Governance** | `Gemini Auditor` | Red Team vs Blue Team AI. Forensic Policy RAG & Velocity Checks. |
| **2. ZK Invoice Privacy** | `Groth16` | Simulated Zero-Knowledge Proof structure for privacy preservation. |
| **3. Agent Negotiation** | `Node.js API` | Autonomous HTTP negotiation with Supplier Agents to cut costs. |
| **4. MNEE Paymaster** | `ERC-4337` | 100% Gasless User Experience (Relayer architecture). |
| **5. AP2 Mandates** | `EIP-712` | Cryptographically secured payment intents with strict TTL. |
| **6. Enterprise Audit** | `JSON-LD` | W3C-compliant audit trails for corporate compliance. |
| **7. Multi-Sig Reactions** | `Telegram/Slack` | Emoji-based consensus for high-value transaction approval. |
| **8. Gas Optimization** | `Real-Time Data` | Monitors Base L2 gas prices to suggest optimal payout times. |
| **9. On-Chain Reputation** | `Credit Logic` | Dynamic "Trust Score" for agents based on audit pass rates. |

## 🏗 Architecture

- **Interface**: Telegram/Slack Bots - The Command Center.
- **Agent Logic**: Gemini 2.5 Flash + AP2 - The Brains.
- **Blockchain**: MNEE Stablecoin + Safe Core SDK - The Rails.
- **Trust**: ZK-Escrow (Simulated) - The Guarantee.

## 📂 Repository Structure

- `/contracts`: Solidity Smart Contracts (ZK-Escrow, MandateRegistry).
- `/agent`: Agentic logic, AP2 mandates, TLSNotary verification.
- `/bot`: Telegram command center (User Session management).
- `/docs`: Executive Audit Trail (Transaction receipts).

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Telegram account
- Azure account (for Voice Biometrics) - optional
- Gemini API key (from aistudio.google.com)

### Setup
```bash
# 1. Install dependencies
cd agent && npm install && cd ..
cd bot && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Run the bots (Concurrent)
cd bot && npm run start
```

### Test Commands (in Telegram)
- `/start` - Initialize the bot
- `/pay 40 MNEE to @vendor for server costs` - Test payment flow
- Send a voice message - Test biometric authentication

## ⚠️ Important: Custodial Prototype

This is a **hackathon prototype** demonstrating a custodial treasury model:
- The operator holds the treasury wallet private key
- Users authorize payments through the bot; the operator's wallet executes them
- For production, consider non-custodial approaches (WalletConnect, Account Abstraction with user-owned keys)

This architecture is suitable for:
- B2B treasury management where a company controls the wallet
- Demonstration and proof-of-concept purposes
- Internal corporate expense automation

## 📄 License
MIT

## 🔗 Links
- [MNEE Stablecoin](https://mnee.io)
- [Live Bot](https://t.me/mnee_sentinel_bot)
