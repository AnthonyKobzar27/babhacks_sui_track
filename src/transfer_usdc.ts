import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// === CONFIG ===
// Paste the private key of the wallet that HAS the USDC (the new temp wallet)
const SOURCE_PRIVATE_KEY = "suiprivkey1qqchn4nf9yzqshcqxnumsnh4g7c2jzfv7wvadl6ptqnpm4qksa8pgjacxqp";
// The main wallet address to receive the USDC
const DEST_ADDRESS = "0xb7d6358e7489500f603ac9f59eb4cc0dee700b4e22a4d9ca7ecdbcf410749fde";
// ==============

const client = new SuiJsonRpcClient({ network: 'testnet', url: 'https://fullnode.testnet.sui.io:443' });
const keypair = Ed25519Keypair.fromSecretKey(SOURCE_PRIVATE_KEY);
const sourceAddress = keypair.getPublicKey().toSuiAddress();

(async () => {
  console.log("Source address:", sourceAddress);
  console.log("Destination:", DEST_ADDRESS);

  // Find all coins, look for any USDC coin type
  const allCoins = await client.getAllCoins({ owner: sourceAddress });
  const usdcCoins = allCoins.data.filter(c => c.coinType.includes('::usdc::USDC'));

  if (usdcCoins.length === 0) {
    console.error("No USDC coins found on source address.");
    process.exit(1);
  }

  console.log(`Found ${usdcCoins.length} USDC coin(s):`, usdcCoins.map(c => `${c.coinObjectId} (${c.balance})`));

  const tx = new Transaction();

  if (usdcCoins.length === 1) {
    tx.transferObjects([tx.object(usdcCoins[0].coinObjectId)], DEST_ADDRESS);
  } else {
    // Merge all into the first, then transfer
    const [primary, ...rest] = usdcCoins;
    tx.mergeCoins(tx.object(primary.coinObjectId), rest.map(c => tx.object(c.coinObjectId)));
    tx.transferObjects([tx.object(primary.coinObjectId)], DEST_ADDRESS);
  }

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  console.log("Transfer done! Digest:", result.digest);
  console.log(`View: https://suiscan.xyz/testnet/tx/${result.digest}`);
})();
