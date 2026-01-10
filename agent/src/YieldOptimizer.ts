import { ethers } from 'ethers';

/**
 * @title YieldOptimizer (Now: Operations Optimizer)
 * @notice **Feature 9**: Proactively suggests operational efficiencies.
 *         Real Logic: Monitors L2 Gas Prices to suggest cheap times for batch distributions.
 */
export class YieldOptimizer {

    // Official Base Sepolia RPC (or Mainnet if prod)
    private provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

    /**
     * Checks Network Conditions to recommend operational actions.
     * @param balance Current MNEE Balance
     * @param lastTxTime Timestamp of last transaction
     */
    async recommendStrategy(balance: number, lastTxTime: number): Promise<string | null> {
        console.log("📈 Ops Agent: Checking Network Gas Conditions...");

        try {
            // 1. Fetch REAL Live Gas Price from Base Network
            const feeData = await this.provider.getFeeData();
            // Default to '0.001' if null (L2s are often near zero)
            const gasPrice = feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : '0.001';
            const gasPriceNum = parseFloat(gasPrice);
            const blockNum = await this.provider.getBlockNumber();

            console.log(`⛽ Real-Time Gas Price: ${gasPrice} gwei`);

            // 2. Dynamic Strategy Pool (Real Logic + Variety)
            const strategies: string[] = [];

            // Strategy A: Low Gas (Standard on Base)
            if (gasPriceNum < 0.1) {
                strategies.push(`⛽ Gas Optimization: Fees are low (${gasPrice} gwei). Ideal for executing batch payouts.`);
                strategies.push(`📉 Cost Efficiency: Network usage is light. Suggested: Deploy new mandate contracts now.`);
                strategies.push(`🏗️ Operations: Gas is cheap (${gasPrice} gwei). Good time to top-up the Paymaster.`);
            } else {
                strategies.push(`⏳ High Traffic: Gas is ${gasPrice} gwei. Recommend pausing non-urgent disbursements.`);
            }

            // Strategy B: Treasury Management
            if (balance > 5000) {
                strategies.push(`💰 Treasury Health: Balance is high (${balance} MNEE). Consider moving excess to Cold Storage.`);
                strategies.push(`💧 Liquidity: Large float detected. Suggest providing liquidity to MNEE/USDC pool.`);
            }

            // Strategy C: Security / Ops (Public Info Only)
            strategies.push(`📡 Network Status: Base Sepolia connection is stable (${blockNum} blocks).`);

            // Select 1 Random Insight from the RELEVANT strategies
            if (strategies.length > 0) {
                const randomIdx = Math.floor(Math.random() * strategies.length);
                return strategies[randomIdx];
            }

        } catch (e: any) {
            console.warn("⚠️ Failed to fetch live gas:", e.message);
        }

        return null;
    }
}
