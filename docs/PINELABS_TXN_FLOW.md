# PineLabs Transaction Flow — Reference

How Volopay's backend actually processes PineLabs card + UPI expenses. This is
the source of truth for building the ToolGate expense simulator so its payloads
drive the **exact same code path** as production.

> Verified against the Volopay Rails backend (`volo-be`, branch
> `zipcode_rule_for_address`). File:line citations below point into that repo.

---

## 1. The two webhooks

Real PineLabs transactions are driven by two separate webhook POSTs:

| Webhook | Route | Effect |
|---|---|---|
| **Auth** | `POST /api/v3/callbacks/pinelabs-authorize` | Locks funds — creates a `SpendAuth` + an `Expense` with `settlement_status: unsettled`. |
| **Txn-notification** | `POST /api/v3/callbacks/pinelabs-txn-notifications` | The settlement trigger — drives `expense.settle!` (unsettled → settled), plus void / reversal / refund variants. |

An expense only *settles* when the notification arrives. Auth alone leaves it
`unsettled`.

---

## 2. No crypto, IP-only guard

- **No checksum / signature** on incoming webhooks; response checksum is a
  hardcoded `''`. The simulator needs no crypto.
  (`transaction_service.rb:466`)
- **Only guard = IP allowlist**, and it is fully bypassed in dev / staging / test:
  ```ruby
  def whitelist_pinelabs_ips
    return true if Rails.env.staging? || Rails.env.development? || Rails.env.test?
    ...
  end
  ```
  (`pinelabs_webhook_concern.rb:15-21`)

So a plain POST with a valid body + the right DB records is accepted in non-prod.

---

## 3. The link key (auth ↔ settle)

The notification finds the expense created by the auth via a shared reference.
**It must be identical in both payloads:**

| Type | Link key |
|---|---|
| **Card** | `transactionDetail.rrn` |
| **UPI** | top-level `transactionUniqueId` |

(`get_transaction_ref_no`, `transaction_service.rb:251-257`)

---

## 4. Card vs UPI detection

Decided purely by `cardDetail.referenceNumber`:

```ruby
def upi_expense?(webhook)
  webhook.data.dig('cardDetail', 'referenceNumber').nil?
end
```
(`transaction_service.rb:18-20`)

- `referenceNumber` **present** ⇒ **card**. Lookup keys off `referenceNumber`
  (`card_id`).
- `referenceNumber` **nil** ⇒ **UPI**. Lookup keys off `cardDetail.cardNumber`
  (`account_number`).

(`get_mapping` / `get_provider_card`, `transaction_service.rb:10-28`)

> ⚠️ **Card caveat:** the txn-notification controller resolves the card via
> `referenceNumber` **only** (`pinelabs_webhooks_controller.rb:21-22`, and the
> auth slug lookup at `:48`). For a **card** lifecycle, keep `referenceNumber`
> populated in **both** the auth and the notification payloads, or settlement
> can't find the card.

---

## 5. transactionType routing

Notification behaviour is chosen by `transactionDetail.transactionType`:

```ruby
TXN_NOTIFICATION_TYPES = {
  debit: 2, void: 9, reversal: 18, refund: 17,
  cash_withdrawal: 34, surcharge_reversal: 21, upi_refund: 23
}
```
(`pinelabs/constants.rb:3-11`)

| transactionType | Action | Result |
|---|---|---|
| `2` debit | `clear_expense` | unsettled → **settled** |
| `34` cash_withdrawal | `clear_expense` | settled (ATM) |
| `9` void / `18` reversal | `reverse_expense` | unsettled → **released** |
| `17` refund / `21` surcharge_reversal | `refund_expense` | new **negative** expense |
| `23` upi_refund | `refund_expense` (UPI only) | new negative expense |

(`pinelabs_payment_processing_job.rb:17-33`)

> ⚠️ **UPI debit needs `approvalCode`.** For a UPI `debit(2)`, if
> `transactionDetail.approvalCode` is **absent**, the expense **auto-reverses**
> instead of settling:
> ```ruby
> is_upi && approvalCode.present? ? clear_expense : reverse_expense
> ```
> (`pinelabs_payment_processing_job.rb:19-24`). Card debit always clears.

---

## 6. Decline is engineered at AUTH, not signalled in the payload

A decline is the **server's** response to the auth (`authorizationStatus: 1` +
a `responseMessage`), not a payload flag. It's driven by the DB state / limits at
auth time, e.g.:

- `card_not_found` — no `CardClientMapping` / `ProviderCard` for the ref.
  (`transaction_service.rb:38,43`)
- `low_card_balance` — funded `CardBudget` below amount.
- `low_account_balance` — funded payments `Account` below amount.
- `transaction_limit_breach` — amount over the per-txn limit
  (`TXN_AMT_LIMIT_PER_TXN 200000`, ATM `2000`, contactless `5000`).
- UPI-specific: `upi_activation_limit_breach` (> `5000`), amount >
  `UPI_TRANSACTION_AMOUNT_LIMIT 10000`, daily count >
  `UPI_DAILY_TOTAL_TRANSACTIONS_LIMIT 10`.

(limits: `pinelabs/constants.rb:14-26`)

**Implication for the simulator UI:** to demo a decline you either (a) send an
amount above a limit, or (b) point at a card configured (on the controller side)
to decline — block policy / low budget. The simulator can't force a decline
purely from the payload; the card/limit must be set up to reject.

---

## 7. Status model

`Expense.settlement_status` AASM: `unsettled → settled | released`
(`expense.rb:356-366`).

A **refund or reversal of an already-settled expense is a new negative
`Expense`**, not a status change on the original.

---

## 8. The 4 core simulator scenarios (client view)

Mapped onto the verified flow. Card values shown; UPI notes inline.

| Scenario | Calls fired | Payload specifics |
|---|---|---|
| **Create expense** | auth only | `build_*_auth` — `transactionType: 2` (debit). Leaves expense `unsettled`, SpendAuth locked. |
| **Create + settle expense** | auth → notification | notification `transactionType: 2`, `reasonCode: 0`, `message: "Transaction successful."`. **UPI: include `approvalCode`** or it reverses. Same link key (rrn / txnUniqueId) as the auth. |
| **Decline an expense** | auth only, expect `authorizationStatus: 1` | Not a payload flag — engineer via amount-over-limit, or a card configured to decline (block/limit). UI note: *"configure the block/limit on the card in the controller."* |
| **Refund an expense** | auth → settle → refund notification | **Card** refund → `transactionType: 17`. **UPI** refund → `transactionType: 23`. `message: "Transaction is already cancelled."`, `reasonCode: 0`. References the settled expense's link key. |

> ⚠️ Refund type must follow card-vs-UPI: **17 for card, 23 for UPI** — key it
> off whether `referenceNumber` is present, not off a random weight.

---

## 9. Exact payload shapes

From the real controller specs
(`spec/controllers/api/v3/pinelabs_webhooks_controller_spec.rb`).

### Auth (`pinelabs-authorize`)
```jsonc
{
  "transactionUniqueId": 212435,
  "cardDetail": {
    "referenceNumber": 62345612345524,   // nil ⇒ UPI; present ⇒ card
    "maskedCardNumber": "123456******1234",
    "externalCardIdentifier": "a-1234",
    "cardNumber": "832468237642"          // UPI account when referenceNumber is nil
  },
  "transactionDetail": {
    "transactionType": 2,
    "transactionMode": 1,
    "transactionAmount": 5000,            // minor units (paise) for card
    "surchargeAmount": 0,
    "rrn": "0987366789",                  // card link key
    "feeType": 2,                         // camelCase — the spec's lowercase `feetype` is ignored (transaction_service.rb:39)
    "transactionUniqueId": 212435
  },
  "merchantDetail": {
    "mcc": "0345", "merchantName": "Big Bazar",
    "city": "Noida", "tid": "123456", "mid": "ABCD1234"
  }
}
```

### Txn-notification (`pinelabs-txn-notifications`)
```jsonc
{
  "transactionUniqueId": 10001,           // UPI link key (= auth's)
  "notificationUniqueId": 1000123,        // dedup key; duplicate ⇒ "webhook already present"
  "cardDetail": { "referenceNumber": 62345612345524, ... },  // keep for card
  "transactionDetail": {
    "transactionType": 2,                 // 2 settle · 9/18 reverse · 17/23 refund
    "transactionAmount": 500000,
    "rrn": "0987366789",                  // card link key (= auth's)
    "approvalCode": "asx123",             // REQUIRED on UPI debit to settle
    "transactionTime": "2021-11-22 17:34:39.234",
    "message": "Success",
    "transactionUniqueId": 10001
  },
  "merchantDetail": { ... }
}
```

**UPI variant:** set `cardDetail.referenceNumber = null`, put the account in
`cardDetail.cardNumber`, use top-level `transactionUniqueId` as the link key,
and include `approvalCode` on debit.

---

## 10. DB prerequisites (real backend, per tenant)

For the auth to be accepted (not `card_not_found`), the client tenant needs:
- a `CardClientMapping` (`card = referenceNumber`, `provider: 'pinelabs'`),
- a `ProviderCard` (`card_id = referenceNumber`; UPI: `account_number = cardNumber`),
- a funded `CardBudget` / `Account`.

(spec setup `pinelabs_webhooks_controller_spec.rb:13-19, 90-99`)

These live in Volopay, not ToolGate — the simulator just needs to target a
staging card that already has them.

---

## 11. ToolGate mapping notes (for whoever builds the simulator)

ToolGate's payload builders already carry most of this
(`backend/payload_builder.py`): `build_card_auth`, `build_card_notification`,
`build_upi_auth`, `build_upi_notification` accept `txn_type`, `reason_code`,
`message`; `TxnType` enum matches the codes above. Two corrections to apply when
wiring scenarios (both currently wrong in the load-test `child_notif` path,
`engine.py:331-379`):

1. **Refund type by card-vs-UPI** — use `17` for a card parent, `23` for a UPI
   parent, not a random weighted pick.
2. **UPI settle needs `approvalCode`** — the UPI notification builder must emit
   `approvalCode` for a `debit(2)` settle, or the expense reverses.

Decline can't be forced from the payload — surface it in the UI as "requires a
card/limit configured to reject."
