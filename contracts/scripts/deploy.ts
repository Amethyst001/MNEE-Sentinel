import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    // 1. Deploy MandateRegistry
    const MandateRegistry = await ethers.getContractFactory("MandateRegistry");
    const registry = await MandateRegistry.deploy();
    await registry.waitForDeployment();
    console.log("MandateRegistry deployed to:", await registry.getAddress());

    // 2. Deploy Mock MNEE (if on local network) or use real address
    // For this script we'll assume we need to deploy a mock if MNEE_ADDRESS env var isn't set
    let mneeAddress = process.env.MNEE_ADDRESS;

    if (!mneeAddress) {
        console.log("No MNEE_ADDRESS provided, deploying MockMNEE...");
        const MockMNEE = await ethers.getContractFactory("MockMNEE");
        // We need to create a simple mock first if we want this to work locally without env
        // But for now, we'll placeholder it.
        // mneeAddress = await mockMNEE.getAddress();
        // For now, let's just use the mainnet address as a placeholder if not testing locally
        mneeAddress = "0x8ccedbAe4916b79da7F3F612EfB2EB93A2bFD6cF";
    }

    // 3. Deploy Escrow
    const Escrow = await ethers.getContractFactory("MNEEEscrow");
    const escrow = await Escrow.deploy(mneeAddress);
    await escrow.waitForDeployment();

    console.log("MNEEEscrow deployed to:", await escrow.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
