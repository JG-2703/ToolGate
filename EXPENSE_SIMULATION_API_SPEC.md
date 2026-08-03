# Expense Simulation API — Integration Guide

## Overview

The Expense Simulation API lets you create and simulate the full lifecycle of a
card or UPI expense on demand — **create, settle, refund, and decline** — without
needing a real transaction from the payment provider.

Use it to build and test your integration against realistic Volopay expenses:
verify how expenses appear, settle, and refund in your account, and confirm your
reconciliation and reporting logic — all on your own schedule.

> This runs against your **test/sandbox** account. It produces real expense
> records in that environment so your integration sees exactly what it would in
> production.

---

## Providers

The API is **provider-agnostic** — the same request shape works across payment
providers. You choose the provider per request.

**Currently supported:**
- `pinelabs` — card + UPI
- `airwallex` — card

More providers will be added over time. Any provider-specific fields are called
out where relevant; the core request and response shape stays the same.

---

## Authentication

Every request must include your API key in the request header:

```
Authorization: Bearer <YOUR_API_KEY>
```

API keys are issued per account and scoped to your test environment. Keep them
secret; do not embed them in client-side code.

---

## Endpoint

```
POST /api/v1/expense-simulations
```

`Content-Type: application/json`

---

## The four scenarios

| Scenario | What it simulates | Result in your account |
|---|---|---|
| `create` | A spend is authorised | A pending (unsettled) expense |
| `settle` | A spend is authorised, then confirmed | A settled expense |
| `refund` | A settled spend is refunded | A refund (negative expense) |
| `decline` | A spend is rejected | No expense; a decline reason is returned |

Each works for both **card** and **UPI** (where the provider supports UPI).

---

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | string | yes | `pinelabs` or `airwallex` |
| `scenario` | string | yes | `create`, `settle`, `refund`, or `decline` |
| `type` | string | yes | `card` or `upi` |
| `card_reference` | string | yes | The test card/account identifier in your account |
| `amount` | number | yes | Amount in major units (e.g. rupees). Reflected on the final expense |
| `currency` | string | no | Defaults to the account currency (e.g. `INR`) |
| `merchant` | object | no | `{ "name", "category_code", "city" }` — defaults applied if omitted |
| `decline_reason` | string | no | Only for `scenario: "decline"` (see list below) |

### Sample request

```json
POST /api/v1/expense-simulations
Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json

{
  "provider": "pinelabs",
  "scenario": "settle",
  "type": "card",
  "card_reference": "6204430025899918",
  "amount": 5000,
  "currency": "INR",
  "merchant": {
    "name": "DMART",
    "category_code": "5411",
    "city": "MUMBAI"
  }
}
```

---

## Response body

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | Whether the simulation completed as intended |
| `simulation_id` | string | Unique id for this simulation run |
| `provider` | string | Provider used |
| `scenario` | string | Scenario run |
| `type` | string | `card` or `upi` |
| `expense_id` | string | The created expense (null for a decline) |
| `status` | string | Final state: `unsettled`, `settled`, `refunded`, or `declined` |
| `amount` | number | Amount applied to the expense |
| `decline_reason` | string | Present only when declined |
| `steps` | array | Each stage that ran, with its outcome |

Each item in `steps`: `{ "step", "ok", "detail" }`.

### Sample response — `settle` (success)

```json
{
  "ok": true,
  "simulation_id": "sim_9f2a1c7b",
  "provider": "pinelabs",
  "scenario": "settle",
  "type": "card",
  "expense_id": "exp_48213",
  "status": "settled",
  "amount": 5000,
  "steps": [
    { "step": "authorize", "ok": true, "detail": "Expense created (unsettled)" },
    { "step": "settle",    "ok": true, "detail": "Expense settled" }
  ]
}
```

### Sample response — `create`

```json
{
  "ok": true,
  "simulation_id": "sim_1b83de40",
  "provider": "pinelabs",
  "scenario": "create",
  "type": "card",
  "expense_id": "exp_48219",
  "status": "unsettled",
  "amount": 5000,
  "steps": [
    { "step": "authorize", "ok": true, "detail": "Expense created (unsettled)" }
  ]
}
```

### Sample response — `refund`

```json
{
  "ok": true,
  "simulation_id": "sim_7c04aa9e",
  "provider": "pinelabs",
  "scenario": "refund",
  "type": "card",
  "expense_id": "exp_48222",
  "refund_expense_id": "exp_48223",
  "status": "refunded",
  "amount": 5000,
  "steps": [
    { "step": "authorize", "ok": true, "detail": "Expense created (unsettled)" },
    { "step": "settle",    "ok": true, "detail": "Expense settled" },
    { "step": "refund",    "ok": true, "detail": "Refund created (-5000)" }
  ]
}
```

### Sample request + response — `decline`

Request:
```json
{
  "provider": "pinelabs",
  "scenario": "decline",
  "type": "card",
  "card_reference": "6204430025899918",
  "amount": 5000,
  "decline_reason": "low_card_balance"
}
```

Response:
```json
{
  "ok": true,
  "simulation_id": "sim_a55e1290",
  "provider": "pinelabs",
  "scenario": "decline",
  "type": "card",
  "expense_id": null,
  "status": "declined",
  "decline_reason": "low_card_balance",
  "steps": [
    { "step": "authorize", "ok": false, "detail": "Declined: low_card_balance" }
  ]
}
```

### Sample request — UPI settle

```json
{
  "provider": "pinelabs",
  "scenario": "settle",
  "type": "upi",
  "card_reference": "9876543210",
  "amount": 750,
  "merchant": { "name": "SWIGGY", "category_code": "5812" }
}
```

---

## Decline reasons

Use with `scenario: "decline"`:

`low_card_balance`, `low_budget_balance`, `low_account_balance`,
`transaction_limit_breach`, `card_inactive`, `merchant_not_allowed`,
`mcc_not_allowed`.

UPI-specific: `upi_merchant_not_allowed`, `upi_activation_limit_breach`,
`upi_limit_breach`.

If omitted, a sensible default decline is applied based on the amount.

---

## Behaviour & guarantees

- **On-demand:** you do not need any action from the payment provider — the
  simulation is fully self-contained.
- **Realistic:** each simulation produces a real expense record in your test
  account, identical to one from a genuine transaction.
- **Unique per run:** every call creates an independent transaction. Running the
  same request twice creates two separate expenses — no duplicates.
- **Amount accuracy:** the `amount` you send is what appears on the settled
  expense.
- **Test environment only:** the API operates on your sandbox/test account.

---

## Errors

Standard HTTP status codes:

| Status | Meaning |
|---|---|
| `200` | Simulation ran (check `ok` and `status` for the outcome) |
| `400` | Invalid request (bad scenario/type/amount, missing field) |
| `401` | Missing or invalid API key |
| `403` | Not permitted (e.g. attempted against a non-test account) |
| `404` | `card_reference` not found in your account |
| `429` | Too many requests — slow down and retry |

Error body:
```json
{
  "ok": false,
  "error": {
    "code": "card_not_found",
    "message": "No card matching the provided card_reference in this account."
  }
}
```

---

## Prerequisites

Your test account needs a valid **test card or UPI account** with a funded
budget. Set this up once via your Volopay test environment (or ask your Volopay
contact). The `card_reference` in each request must point to one of these.

---

## Quick start

1. Get your **test API key** from Volopay.
2. Create a **test card** with a funded budget.
3. Call `POST /api/v1/expense-simulations` with `scenario: "create"` to see a
   pending expense appear.
4. Repeat with `settle`, `refund`, and `decline` to exercise each flow.
5. Verify each outcome in your account and in your integration.
