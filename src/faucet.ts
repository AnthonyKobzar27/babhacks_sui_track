import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import keyPairJson from "../keypair.json" with { type: "json" };

const recipient = keyPairJson.publicAddress;

(async () => {
  console.log("Requesting testnet SUI for", recipient);
  const host = getFaucetHost("testnet");
  try {
    const res = await requestSuiFromFaucetV2({ host, recipient });
    console.log("Faucet response:", res.status);
    if (res.coins_sent?.length) {
      console.log("Received", res.coins_sent.length, "coin(s). You can run the challenge scripts now.");
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
