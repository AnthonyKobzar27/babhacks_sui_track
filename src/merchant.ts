import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import keyPairJson from "../keypair.json" with { type: "json" };

const PACKAGE = "0x936313e502e9cbf6e7a04fe2aeb4c60bc0acd69729acc7a19921b33bebf72d03";
const USDC_PACKAGE = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29";
const USDC_TYPE = `${USDC_PACKAGE}::usdc::USDC`;
const COST_PER_FLAG = 3849000; // exact amount required (3.849 USDC with 6 decimals)

const keypair = Ed25519Keypair.fromSecretKey(keyPairJson.privateKey);
const client = new SuiJsonRpcClient({ network: 'testnet', url: 'https://fullnode.testnet.sui.io:443' });
const myAddress = keypair.getPublicKey().toSuiAddress();

(async () => {
  console.log("Looking for USDC coins...");

  const { data: coins } = await client.getCoins({
    owner: myAddress,
    coinType: USDC_TYPE,
  });

  if (coins.length === 0) {
    console.error("No USDC found! Get testnet USDC from the Circle faucet or Sui rep.");
    process.exit(1);
  }

  const totalUsdc = coins.reduce((sum: number, c: { balance: string }) => sum + Number(c.balance), 0);
  console.log(`Found ${coins.length} USDC coin(s), total: ${totalUsdc} (need ${COST_PER_FLAG})`);

  if (totalUsdc < COST_PER_FLAG) {
    console.error(`Insufficient USDC. Have ${totalUsdc}, need ${COST_PER_FLAG}`);
    process.exit(1);
  }

  const tx = new Transaction();

  // Merge all USDC into first coin, then split exact amount
  const primaryCoin = tx.object(coins[0].coinObjectId);
  if (coins.length > 1) {
    tx.mergeCoins(primaryCoin, coins.slice(1).map((c: { coinObjectId: string }) => tx.object(c.coinObjectId)));
  }
  const [paymentCoin] = tx.splitCoins(primaryCoin, [COST_PER_FLAG]);

  const flag = tx.moveCall({
    target: `${PACKAGE}::merchant::buy_flag`,
    arguments: [paymentCoin],
  });
  tx.transferObjects([flag], myAddress);

  console.log("Buying flag with 3.849 USDC...");
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  console.log("Flag purchased! Digest:", result.digest);
  console.log(`View: https://suiscan.xyz/testnet/tx/${result.digest}`);
})();
