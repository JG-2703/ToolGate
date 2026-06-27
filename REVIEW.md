# ToolGate — Review Doc

**What it does:** Hammer Volopay's PineLabs callback endpoints with fake transactions and measure if they pass/fail correctly and how fast they respond.

---

## The Big Picture (Simple Version)

When someone swipes a Volopay card or makes a UPI payment via PineLabs, PineLabs sends two HTTP requests to Volopay:

1. **Auth** — "Hey, should I allow this ₹500 grocery purchase?" → Volopay says YES or NO
2. **Notification** — "FYI, that ₹500 purchase went through" → Volopay says OK

ToolGate pretends to BE PineLabs and fires thousands of these requests at Volopay's staging server. It measures latency, checks if Volopay made the right call, and exports all data to CSV.

---

## Two Transaction Types

### 1. Card Transaction

User swipes a physical/virtual Volopay card at a merchant.

**What identifies it:**
- `referenceNumber` — the card ID in Volopay's system (you supply this)
- `mcc` — merchant category code (e.g. `5411` = grocery, `6011` = ATM, `7995` = gambling)
- `rrn` — 12-digit bank reference number

**Auth Payload (Card)**
```json
{
  "accountDetails": null,
  "cardDetail": {
    "cardNumber": "6204430025899918",
    "expenseCategory": null,
    "expenseCategoryService": null,
    "externalAccountNumber": null,
    "externalCardIdentifier": "volopayinpinelabs-1",
    "geoLocation": {
      "ip": "202.179.159.84",
      "latitude": null,
      "longitude": null
    },
    "maskedCardNumber": "608363******1867",
    "referenceNumber": "9965777339"
  },
  "merchantDetail": {
    "city": "BANGALORE",
    "mcc": "5411",
    "merchantName": "VOLOPAY TEST MERCHANT",
    "mid": "000hdfc70039908",
    "payeeVPA": null,
    "tId": "70039908"
  },
  "transactionDetail": {
    "batchId": 47291833,
    "feeType": null,
    "feeTypeName": null,
    "fromPocketType": null,
    "invoiceNumber": "RRN:615742098054",
    "loadType": null,
    "rrn": "615742098054",
    "toPocketType": null,
    "transactionAmount": 487.50,
    "transactionId": 1839274651,
    "transactionMode": 3,
    "transactionType": 2
  },
  "transactionUniqueId": 1718000000123
}
```

**Notification Payload (Card)**
```json
{
  "accountDetails": null,
  "cardDetail": {
    "cardNumber": "6204430025899918",
    "expenseCategory": null,
    "expenseCategoryService": null,
    "externalAccountNumber": null,
    "externalCardIdentifier": "volopayinpinelabs-1",
    "geoLocation": {
      "ip": "202.179.159.84",
      "latitude": null,
      "longitude": null
    },
    "maskedCardNumber": "608363******1867",
    "referenceNumber": "9965777339"
  },
  "merchantDetail": {
    "city": "BANGALORE",
    "mcc": "5411",
    "merchantName": "VOLOPAY TEST MERCHANT",
    "mid": "000hdfc70039908",
    "payeeVPA": null,
    "tId": "70039908"
  },
  "notificationUniqueId": 1718000000456,
  "transactionDetail": {
    "approvalCode": "7382910465",
    "batchId": 47291834,
    "feeType": null,
    "feeTypeName": null,
    "fromPocketType": null,
    "invoiceNumber": "RRN:615742098054",
    "loadType": null,
    "merchantName": "PL-IPPS-CN-Volopay",
    "message": "Transaction successful.",
    "notes": "{\"ppTxnType\":2,\"gstAmount\":0}",
    "reasonCode": 0,
    "rrn": "615742098054",
    "tansactionTime": "06/10/2025 14:30:00",
    "toPocketType": null,
    "transactionAmount": 487.50,
    "transactionId": 1293847561,
    "transactionMode": 3,
    "transactionTime": "06/10/2025 14:30:00",
    "transactionType": 2,
    "transferCardBalance": 2341098.50,
    "transferCardExpiry": "2030-07-09T00:00:00+05:30",
    "transferCardNumber": "7204430010000001",
    "upiTxnType": null
  },
  "transactionUniqueId": 1718000000123
}
```

> **Note:** `tansactionTime` is a typo that exists in prod PineLabs code. Do not fix it.

---

### 2. UPI Transaction

User pays via UPI (Google Pay, PhonePe, etc.) to a merchant VPA.

**What identifies it:**
- `payeeVPA` — the UPI address being paid (e.g. `merchant@okhdfcbank`)
- `mcc` — **critical for block testing:**
  - `"0000"` = personal P2P transfer → Volopay **SHOULD BLOCK** this
  - anything else = merchant payment → Volopay **SHOULD ALLOW** this

**Auth Payload (UPI)**
```json
{
  "accountDetails": null,
  "cardDetail": {
    "cardNumber": "6204430026865829",
    "expenseCategory": null,
    "expenseCategoryService": null,
    "externalAccountNumber": null,
    "externalCardIdentifier": null,
    "geoLocation": null,
    "maskedCardNumber": null,
    "referenceNumber": null
  },
  "merchantDetail": {
    "city": null,
    "mcc": "0000",
    "merchantName": null,
    "mid": null,
    "payeeVPA": "arjun@okhdfcbank",
    "tId": null
  },
  "transactionDetail": {
    "batchId": 63829104,
    "feeType": null,
    "feeTypeName": null,
    "fromPocketType": null,
    "invoiceNumber": "PILMPa3f2e1b09c7d4e5f6a1b2c3d4e5f6a7",
    "loadType": null,
    "rrn": null,
    "toPocketType": null,
    "transactionAmount": 350.00,
    "transactionId": 928374651,
    "transactionMode": null,
    "transactionType": 2
  },
  "transactionUniqueId": 1718000001234
}
```

**Notification Payload (UPI)**
```json
{
  "accountDetails": null,
  "cardDetail": {
    "cardNumber": "6204430026865829",
    "expenseCategory": null,
    "expenseCategoryService": null,
    "externalAccountNumber": null,
    "externalCardIdentifier": null,
    "geoLocation": null,
    "maskedCardNumber": null,
    "referenceNumber": null
  },
  "merchantDetail": {
    "city": null,
    "mcc": "0000",
    "merchantName": null,
    "mid": null,
    "payeeVPA": "arjun@okhdfcbank",
    "tId": null
  },
  "notificationUniqueId": 1718000001567,
  "transactionDetail": {
    "approvalCode": "5647382910",
    "batchId": 63829105,
    "feeType": null,
    "feeTypeName": null,
    "fromPocketType": null,
    "invoiceNumber": "PILMPb4g3h2i1j0k9l8m7n6o5p4q3r2s1t0",
    "loadType": null,
    "merchantName": "UPI Switch",
    "message": "Transaction successful.",
    "notes": "|RRNumber~748291038475|",
    "reasonCode": 0,
    "rrn": null,
    "tansactionTime": "06/10/2025 14:31:00",
    "toPocketType": null,
    "transactionAmount": 350.00,
    "transactionId": 837465291,
    "transactionMode": null,
    "transactionTime": "06/10/2025 14:31:00",
    "transactionType": 2,
    "transferCardBalance": 1987654.25,
    "transferCardExpiry": "2030-07-09T00:00:00+05:30",
    "transferCardNumber": "7204430010000001",
    "upiTxnType": "P2P"
  },
  "transactionUniqueId": 1718000001234
}
```

> **Note:** For UPI, `rrn` is always `null`. The real reference number is buried inside `notes` as `|RRNumber~{number}|`.

---

## Card vs UPI — What's Different

| Field | Card | UPI |
|---|---|---|
| `referenceNumber` | card ID (e.g. "9965777339") | `null` |
| `payeeVPA` | `null` | UPI address (e.g. "user@upi") |
| `rrn` | 12-digit number | `null` |
| `invoiceNumber` | `"RRN:{rrn}"` | `"PILMP{randomhex}"` |
| `transactionMode` | `3` | `null` |
| `mcc` | merchant code (e.g. "5411") | `"0000"` (personal) |
| `geoLocation` | has IP address | `null` |
| `notes` in notif | `{"ppTxnType":2,"gstAmount":0}` | `\|RRNumber~{n}\|` |
| `merchantName` in notif | `"PL-IPPS-CN-Volopay"` | `"UPI Switch"` |
| `upiTxnType` in notif | `null` | `"P2P"` or `"P2M"` |

---

## The UPI Block Policy Test (Most Important Feature)

Volopay has a feature: **block personal UPI transfers from corporate cards**.

How PineLabs signals the transfer type:
- `mcc = "0000"` → personal transfer → Volopay **blocks it** → auth returns non-2xx
- `mcc = "5411"` (or any non-zero) → merchant payment → Volopay **allows it** → auth returns 2xx

ToolGate lets you test this in 3 modes:
- **PERSONAL (0000)** — all txns should be blocked. If success rate > 0%, the block is broken.
- **MERCHANT** — all txns should pass. If success rate < 100%, something's wrong.
- **RANDOM MIX** — 50/50 split. `outcome_matched` metric tells you how accurately Volopay is making the right call.

---

## Notification Types (7 total)

When Volopay receives a notification, `transactionType` tells it what kind of event it is:

| Code | Type | Frequency in prod | What it means |
|---|---|---|---|
| `2` | Debit | 93% | Normal purchase |
| `23` | UPI Refund | 4% | UPI payment reversed |
| `17` | Refund | 1% | Card purchase refunded |
| `34` | Cash Withdrawal | 0.3% | ATM / cash advance |
| `18` | Reversal | 0.15% | Transaction reversed (reasonCode = 5) |
| `21` | Surcharge Reversal | 0.08% | Fee reversed |
| `9` | Void | 0% (rare) | Transaction cancelled before settlement |

**Important:** A `transactionType 2` (debit) notification can be EITHER success OR failure. The only way to tell them apart is the `message` field:
- `"Transaction successful."` → all good
- `"Transaction Authorization Failed."` → it failed at auth
- `"Transaction cannot be performed during the cool off period."` → cool-off period active
- `"Transaction is not processed."` → generic failure

**Stateful sequences:** In real prod, a Refund/Reversal notification MUST reference a prior approved Debit. ToolGate's sequence engine tracks approved debits and auto-generates child notifications (refunds etc.) against them — same as prod behavior.

---

## Why Volopay Declines Auths (Real Data)

From 7 days of prod logs (~1,643 declines total):

| Decline Reason | Count | % | What it means |
|---|---|---|---|
| `low_account_balance` | 1,270 | 77.3% | Company wallet doesn't have enough money |
| `low_card_balance` | 312 | 19.0% | Card's own spending limit exhausted |
| `transaction_limit_breach` | 30 | 1.8% | Single transaction exceeds policy cap |
| `low_budget_balance` | 23 | 1.4% | Budget attached to card ran out |
| `upi_activation_limit_breach` | 7 | 0.4% | UPI daily/monthly limit hit |
| `upi_merchant_not_allowed` | 1 | 0.06% | MCC 0000 personal transfer blocked |

Declines are ~4% of total auth volume.

---

## How the Tool Works Step by Step

```
1. You open http://localhost:5173
2. Fill in your card refs or UPI VPAs
3. Hit DRY TEST → fires 1 transaction, shows you the full payload + response
4. If dry test passes → START LOAD TEST unlocks
5. Workers fire transactions in parallel (you pick how many)
6. Every 500ms the dashboard updates: TPS, P99 latency, success rate, outcome match %
7. When done → download CSV with every single transaction's details
```

---

## What the Metrics Mean

| Metric | What it measures | Healthy |
|---|---|---|
| **Success Rate** | % of requests that got 2xx back | ~96% (4% are real declines) |
| **Outcome Match Rate** | % of requests where Volopay made the right call | ~100% ideally |
| **Auth P99** | 99th percentile latency for auth requests | < 3000ms (configurable) |
| **Deadline Breach Rate** | % of txns exceeding your latency deadline | < 1% |
| **TPS** | Transactions per second | depends on concurrency |

---

## Stateful Sequence Engine

Old ToolGate fired each transaction independently. New version tracks state:

```
DEBIT auth approved → stored in registry[card_ref]
     ↓ (3% of the time, next txn is a child)
REFUND notification → references that approved debit
```

This is closer to real prod traffic. Without this, you'd never test the refund/reversal handler paths.

---

## URLs (Hardcoded to IN Staging)

```
AUTH:   https://main.apis.volopay.site/api/v1/callbacks/pinelabs-authorize
NOTIF:  https://main.apis.volopay.site/api/v1/callbacks/pinelabs-txn-notifications
```

---

## CSV Export Columns

Downloaded per run. One row per transaction step (auth + notification = 2 rows per txn).

```
step, ts_offset_ms, latency_ms, status_code, outcome_matched,
txn_type, card_ref, payee_vpa, rrn, amount, mcc, txn_unique_id
```

---

## How to Start

```powershell
# Terminal 1 — Backend
cd d:\toolGate\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend
cd d:\toolGate\frontend
npm run dev
```

Open: **http://localhost:5173**

---

## Common Gotchas

- **Card refs must exist in Volopay staging** — if the card doesn't exist, you'll get 404s or declines regardless of payload
- **`tansactionTime`** — yes, it's a typo. Yes, it's in prod. Don't "fix" it.
- **Amount is always rupees** — both auth and notification send the same number, no paise conversion
- **UPI `rrn` is always null** — the reference number is inside `notes` as `|RRNumber~12digits|`
- **`transactionUniqueId` links auth to notification** — same value in both, that's how Volopay correlates them
- **Dry test before load test** — the button literally won't let you start a load test until dry test passes
