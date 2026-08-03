# Business Requirements — Expense Simulation Platform

**Document type:** Business Requirements Document (BRD)
**Audience:** Engineering / Tech
**Status:** Draft for review

---

## 1. Purpose

Provide a simple, on-demand way to **create and simulate the full lifecycle of an
expense** — create, settle, refund, and decline — without waiting for a real card
or UPI transaction from a payment provider.

This lets internal teams and, eventually, clients test how expenses behave in
Volopay (creation, settlement, refunds, declines, reporting, reconciliation) on
their own schedule, in a safe test environment.

---

## 2. Background & problem

Today, producing a realistic expense for testing requires a real transaction or
manual, ad-hoc scripts. There is no easy, repeatable, self-service way to:

- create a pending expense,
- settle it,
- refund it,
- or produce a controlled decline,

on demand, for both card and UPI, across payment providers.

This slows down testing, integration work, and support investigations.

---

## 3. Goals

- One capability to simulate the **four core expense outcomes**: create, settle,
  refund, decline.
- Works for **card and UPI** (where the provider supports it).
- **Provider-agnostic** — the same experience across providers; the provider is
  chosen per request. Initially PineLabs and Airwallex; more added over time.
- Produces **real, indistinguishable** expense records in the test environment,
  so downstream logic (settlement, reporting, reconciliation) behaves exactly as
  it would for a genuine transaction.
- Usable both as an **internal tool** (UI) and as an **API** clients can integrate.

## 4. Non-goals

- Not for production / live transactions. Test environment only.
- Not a replacement for real provider testing where that is contractually required.
- Not a load / stress testing tool (that capability exists separately).

---

## 5. Users & access

| User | Access |
|---|---|
| **Admin (internal)** | Full access: run any scenario, manage users, see all activity. |
| **Client / operator** | Restricted: run expense simulations only; cannot see internal tooling or other clients' data. |

- Access is **authenticated** and **role-based**.
- Client-facing access must be scoped to the client's own test environment only.

---

## 6. Functional requirements

### 6.1 Scenarios
The system must support these four scenarios, for card and UPI:

| Scenario | Behaviour | Expected result |
|---|---|---|
| **Create expense** | Simulate a spend being authorised | A pending (unsettled) expense |
| **Settle expense** | Authorise, then confirm the spend | A settled expense with the correct amount |
| **Refund expense** | Settle a spend, then refund it | A refund (negative expense) against the settled one |
| **Decline expense** | Simulate a rejected spend | No expense created; a clear decline reason returned |

### 6.2 Inputs (per simulation)
- Provider (e.g. PineLabs, Airwallex)
- Scenario (create / settle / refund / decline)
- Transaction type (card / UPI)
- Test card / account reference
- Amount
- Optional: merchant details (name, category, city), decline reason

### 6.3 Outputs (per simulation)
- Whether the simulation succeeded
- The expense created (and its identifier)
- Final state: created / settled / refunded / declined (with reason)
- A step-by-step breakdown of what happened

### 6.4 Behaviour rules
- **On-demand & self-contained** — no action needed from the payment provider.
- **Realistic** — the resulting expense is identical to one from a real transaction.
- **Correct amounts** — the amount entered is reflected accurately on the final
  expense; the create and settle stages must agree on the same value.
- **Every run is unique** — the same request run twice creates two independent
  expenses. No duplicates, no "already processed" collisions.
- **Honest declines** — a decline reflects a real rejection reason (e.g. amount
  over limit, insufficient balance, card configured to reject), not a fake flag.
- **Step control (nice to have)** — the user can run only the authorisation
  stage, then trigger settlement later for the same transaction, to test timing
  and out-of-order handling.

### 6.5 Interfaces
- **Internal UI** — a simple, guided screen: pick scenario, enter details, run,
  see the result. Non-technical users should be able to operate it.
- **API** — an authenticated endpoint clients can integrate against their test
  environment, with a consistent request/response shape across providers and
  clear error responses.

---

## 7. Non-functional requirements

- **Security**
  - Authenticated access only; passwords/credentials stored securely.
  - Role-based permissions (admin vs client).
  - Never operable against production / live accounts.
  - Requests can only target approved test destinations (no arbitrary/internal
    targets).
- **Reliability**
  - Safe to re-run; repeated calls never corrupt or double-count data.
  - Clear, actionable error messages (invalid input, unknown card, not permitted,
    rate limited).
- **Usability**
  - Client-facing language (no internal jargon); expense-oriented terms, not
    payment-plumbing terms.
- **Auditability**
  - Each simulation is traceable (who ran what, when, and the outcome).
- **Extensibility**
  - Adding a new provider must not change the core request/response shape.

---

## 8. Assumptions & dependencies

- A **test card / account with a funded budget** exists (or can be created) in
  the target environment; simulations run against these.
- The underlying expense-processing logic already exists in Volopay; the
  simulation should **reuse the real flow**, not reimplement expense behaviour.
- Provider-specific transaction handling (e.g. how settlement is triggered)
  follows each provider's existing integration.

---

## 9. Acceptance criteria

The capability is accepted when, in a test environment:

1. **Create** produces a new **unsettled** expense.
2. **Settle** produces a **settled** expense showing the **correct amount**.
3. **Refund** produces a **refund** (negative expense) against a settled expense.
4. **Decline** produces **no** expense and returns the **correct decline reason**.
5. All four work for **card and UPI**.
6. Running the **same request twice** yields **two independent** expenses.
7. Access is **role-controlled**; clients see only their own environment.
8. The capability **cannot** be used against production.
9. Errors return **clear, correct** responses (bad input, unknown card, forbidden,
   rate-limited).

---

## 10. Open questions (for tech to confirm)

- Exact provider list at launch, and priority order for adding more.
- Client authentication mechanism for the public API (API key vs token).
- Whether test cards are self-service or provisioned by Volopay per client.
- Retention / audit requirements for simulation history.
- Rate limits appropriate for client-facing use.

---

## 11. Reference

A detailed technical breakdown of each provider's transaction flow (how
authorisation and settlement link, amount handling, unique-id rules, timing) has
been documented separately and can be shared with the implementing engineers.
This BRD intentionally stays at the requirements level.
