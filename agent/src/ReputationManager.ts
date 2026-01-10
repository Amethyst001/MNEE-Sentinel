/**
 * @title ReputationManager
 * @notice **Feature 10**: On-Chain Credit Scoring for Agents.
 *         Tracks successful audits and negotiations to mint a dynamic "Trust Badge".
 */
export class ReputationManager {

    private successfulDeals: number = 0;
    private totalSaved: number = 0;

    /**
     * Updates the agent's internal reputation state after a deal.
     * @param savedAmount Amount saved during negotiation
     * @param auditPassed Did the Red Team approve?
     */
    updateScore(savedAmount: number, auditPassed: boolean) {
        if (auditPassed) {
            this.successfulDeals++;
            this.totalSaved += savedAmount;
            console.log(`⭐ Reputation Upgraded! Deals: ${this.successfulDeals}, Saved: ${this.totalSaved} MNEE`);
        } else {
            // Penalty for failed audit
            this.successfulDeals = Math.max(0, this.successfulDeals - 1);
            console.log(`📉 Reputation Penalized. Audit Failure.`);
        }
    }

    /**
     * Generates a text-based "SBT" (Soulbound Token) representation for the UI.
     */
    getTrustBadge(): string {
        if (this.successfulDeals > 10) return "🏆 Grandmaster Agent (Tier 3)";
        if (this.successfulDeals > 5) return "🥇 Verified Banker (Tier 2)";
        return "🆕 Probationary Agent (Tier 1)";
    }
}
