import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import keyPairJson from "../keypair.json" with { type: "json" };

const PACKAGE = "0x936313e502e9cbf6e7a04fe2aeb4c60bc0acd69729acc7a19921b33bebf72d03";
const CLOCK = "0x6";

const keypair = Ed25519Keypair.fromSecretKey(keyPairJson.privateKey);
const client = new SuiJsonRpcClient({ network: 'testnet', url: 'https://fullnode.testnet.sui.io:443' });

// Window open: 0-300s or 1800-2100s within each hour
function msUntilNextWindow(): number {
  const seconds = Math.floor(Date.now() / 1000);
  const timeInHour = seconds % 3600;

  if (timeInHour < 300) return 0;
  if (timeInHour < 1800) return (1800 - timeInHour) * 1000;
  if (timeInHour < 2100) return 0;
  return (3600 - timeInHour) * 1000;
}

(async () => {
  const waitMs = msUntilNextWindow();
  if (waitMs > 0) {
    const mins = Math.ceil(waitMs / 60000);
    console.log(`Window closed. Waiting ~${mins} min(s)...`);
    await new Promise(resolve => setTimeout(resolve, waitMs + 1000));
  }

  console.log("Window is open! Extracting flag...");

  const tx = new Transaction();
  const result_0 = tx.moveCall({
    target: `${PACKAGE}::moving_window::extract_flag`,
    arguments: [tx.object(CLOCK)],
  });
  tx.transferObjects([result_0], keypair.getPublicKey().toSuiAddress());

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  console.log("Flag extracted! Digest:", result.digest);
  console.log(`View: https://suiscan.xyz/testnet/tx/${result.digest}`);
})();
