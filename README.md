# Sui CTF – First 4 Flags

This project runs on **Sui Testnet**. Flags are on-chain objects you receive by calling the CTF contract; submit the returned object (or its ID) to the CTF platform.

**Your wallet (from `keypair.json`):**  
`0xcdd223ad6f00c7df0265d983245849217bcf5069c17ad26a676817e622f0ee9b`

---

## Prerequisites

1. **SUI for gas**  
   - Option A: `pnpm faucet` (programmatic; may be rate-limited).  
   - Option B: [faucet.sui.io](https://faucet.sui.io/?network=testnet) → choose Testnet → paste the address above → Request SUI.

2. **USDC for flags 2 & 3**  
   - [faucet.circle.com](https://faucet.circle.com/) → choose **Sui Testnet** → paste the address above.  
   - You need at least **~16 USDC** (3.849 for Merchant + 12 for Lootboxes).  
   - Circle faucet often gives 10 USDC per request (e.g. request twice).

---

## Get the first 4 flags

### Flag 1: Moving Window

Call `moving_window::extract_flag` only when the time window is open (first 5 min or 30–35 min of each UTC hour). The script waits automatically.

```bash
pnpm moving-window
```

If you see **"No valid gas coins"**, fund the wallet with SUI (see Prerequisites).

---

### Flag 2: Merchant

Pay exactly **3.849 USDC** to buy the flag.

```bash
pnpm merchant
```

Requires at least 3.849 USDC in the wallet (get from Circle testnet faucet).

---

### Flag 3: Lootboxes

Uses the exploit package so failed attempts refund USDC. Keeps trying until the flag is won.

```bash
pnpm lootboxes
```

Requires at least **12 USDC** per attempt (USDC is refunded on miss; only gas is spent).

---

### Flag 4: Staking

Two steps:

**Step 1 – Create 168 stake receipts (needs ~1 SUI + gas):**

```bash
pnpm staking
```

This writes `stake_receipts.json`.

**Step 2 – After at least 1 hour, claim the flag:**

```bash
pnpm staking claim
```

Or run `pnpm staking` again after 1 hour; it will detect the elapsed time and run the claim phase.

---

## Scripts summary

| Script              | Command               | Needs                    |
|---------------------|-----------------------|--------------------------|
| Request testnet SUI | `pnpm faucet`         | —                        |
| Flag 1              | `pnpm moving-window`  | SUI (gas)                |
| Flag 2              | `pnpm merchant`       | 3.849 USDC + SUI         |
| Flag 3              | `pnpm lootboxes`      | 12 USDC + SUI            |
| Flag 4              | `pnpm staking` then `pnpm staking claim` (after 1h) | ~1 SUI + gas |

---

## If you get “No valid gas coins”

Your wallet has no SUI for gas. Use one of:

- `pnpm faucet` (if not rate-limited)
- [faucet.sui.io](https://faucet.sui.io/?network=testnet) with your address

Then re-run the challenge script.
