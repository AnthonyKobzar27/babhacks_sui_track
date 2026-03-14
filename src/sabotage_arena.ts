import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import keyPairJson from "../keypair.json" with { type: "json" };

const PACKAGE = "0x936313e502e9cbf6e7a04fe2aeb4c60bc0acd69729acc7a19921b33bebf72d03";
const ARENA = "0x7cf2ab748619f5f8e25a002aa2c60a85b7a6f61220f011358a32cb11c797a923";
const CLOCK = "0x6";
const SHIELD_THRESHOLD = 12;
const COOLDOWN_MS = 600_000; // 10 minutes

const keypair = Ed25519Keypair.fromSecretKey(keyPairJson.privateKey);
const client = new SuiJsonRpcClient({ network: 'testnet', url: 'https://fullnode.testnet.sui.io:443' });
const myAddress = keypair.getPublicKey().toSuiAddress();

async function getPlayerState(): Promise<{ shield: number; last_action_ms: number } | null> {
  try {
    const arena = await client.getObject({ id: ARENA, options: { showContent: true } });
    const content = arena.data?.content as { fields?: { players?: { fields?: { id?: { id?: string } } } } } | undefined;
    const tableId = content?.fields?.players?.fields?.id?.id;
    if (!tableId) return null;

    const playerField = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: 'address', value: myAddress },
    });
    const pf = playerField.data?.content as { fields?: { shield?: string; last_action_ms?: string } } | undefined;
    if (!pf?.fields) return null;
    return {
      shield: Number(pf.fields.shield ?? 0),
      last_action_ms: Number(pf.fields.last_action_ms ?? 0),
    };
  } catch {
    return null;
  }
}

async function sendTx(target: string) {
  const tx = new Transaction();
  tx.moveCall({ target, arguments: [tx.object(ARENA), tx.object(CLOCK)] });
  return client.signAndExecuteTransaction({ signer: keypair, transaction: tx, options: { showEffects: true } });
}

(async () => {
  let player = await getPlayerState();

  if (!player) {
    console.log("Registering in arena...");
    const r = await sendTx(`${PACKAGE}::sabotage_arena::register`);
    console.log("Registered! Digest:", r.digest);
    player = { shield: 0, last_action_ms: 0 };
  } else {
    console.log(`Already registered. Shield: ${player.shield}/${SHIELD_THRESHOLD}`);
  }

  while (player.shield < SHIELD_THRESHOLD) {
    const now = Date.now();
    const waitMs = Math.max(0, player.last_action_ms + COOLDOWN_MS - now);

    if (waitMs > 0) {
      const mins = Math.ceil(waitMs / 60000);
      console.log(`Cooldown active. Waiting ${mins} min(s)... (shield: ${player.shield}/${SHIELD_THRESHOLD})`);
      await new Promise(resolve => setTimeout(resolve, waitMs + 2000));
    }

    try {
      const r = await sendTx(`${PACKAGE}::sabotage_arena::build`);
      player.shield++;
      player.last_action_ms = Date.now();
      console.log(`Built! Shield: ${player.shield}/${SHIELD_THRESHOLD} | Digest: ${r.digest}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Build failed:", msg);
      await new Promise(resolve => setTimeout(resolve, 5000));
      player = await getPlayerState() ?? player;
    }
  }

  console.log("Shield threshold reached! Claiming flag...");
  const tx = new Transaction();
  const flag = tx.moveCall({
    target: `${PACKAGE}::sabotage_arena::claim_flag`,
    arguments: [tx.object(ARENA), tx.object(CLOCK)],
  });
  tx.transferObjects([flag], myAddress);
  const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx, options: { showEffects: true } });
  console.log("FLAG CLAIMED! Digest:", result.digest);
  console.log(`View: https://suiscan.xyz/testnet/tx/${result.digest}`);
})();
