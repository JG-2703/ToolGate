"""PineLabs expense-scenario simulator.

Fires the exact PineLabs webhook payloads for a chosen real-world scenario so the
target backend runs the identical production code path. See
docs/PINELABS_TXN_FLOW.md for the verified flow this implements.

Scenarios (client-facing):
  create   — auth only                     → expense created, unsettled
  settle   — auth → notification(debit 2)  → expense settled
  decline  — auth only, expect non-2xx     → engineered at auth (amount/card cfg)
  refund   — auth → settle → refund notif  → new negative expense
             (card refund = txnType 17, UPI refund = txnType 23)
"""
from __future__ import annotations

import asyncio
import os
import time

import httpx

# Client mode does not supply/see callback URLs — they come from env config.
DEFAULT_AUTH_URL = os.environ.get("TOOLGATE_PINELABS_AUTH_URL", "")
DEFAULT_NOTIF_URL = os.environ.get("TOOLGATE_PINELABS_NOTIF_URL", "")

# The auth callback creates the expense ASYNCHRONOUSLY (PinelabsGenerateExpenseJob
# on Sidekiq). A settle/refund notification that arrives before that job runs
# finds no expense ("Expense not found") and silently does nothing. Wait between
# the auth and the notification so the expense exists first.
SETTLE_DELAY_SEC = float(os.environ.get("TOOLGATE_SETTLE_DELAY_SEC", "3.0"))

from payload_builder import (
    build_card_auth, build_card_notification,
    build_upi_auth, build_upi_notification,
    gen_rrn, gen_txn_unique_id, gen_approval_code, gen_txn_time,
    TxnType,
)

SCENARIOS = ("create", "settle", "decline", "refund")

# Step sequence per scenario. "notification" carries the transactionType.
_STEPS = {
    "create":  ["auth"],
    "settle":  ["auth", "settle"],
    "decline": ["auth"],
    "refund":  ["auth", "settle", "refund"],
}

# Friendly, expense-language labels for the UI (no auth/notification jargon).
# NOTE: a 2xx on settle/refund means the notification was ACCEPTED and queued —
# the actual settlement runs in a downstream async worker inside Volopay, so we
# say "requested", not "done". Confirm the final state in Volopay.
STEP_LABELS = {
    "auth":    "Authorization - expense created",
    "settle":  "Settlement requested - confirm status in Volopay",
    "refund":  "Refund requested - confirm status in Volopay",
}


async def _fire(client: httpx.AsyncClient, url: str, payload: dict, headers: dict,
                step: str, label: str) -> dict:
    """POST one webhook payload, return a StepResult-shaped dict."""
    t0 = time.monotonic()
    try:
        r = await client.post(url, json=payload, headers=headers, timeout=30.0)
        latency = round((time.monotonic() - t0) * 1000, 1)
        try:
            body = r.json()
        except Exception:
            body = r.text[:2000]

        # HTTP 2xx alone does NOT mean success. PineLabs returns 200 even on a
        # decline; the real result is in the body:
        #   auth: authorizationStatus == 0 approved, 1 declined (+ responseMessage)
        # If auth is declined, no expense is created — so a following settle is
        # pointless and would fail ("webhook already present" / not found).
        http_ok = 200 <= r.status_code < 300
        ok = http_ok
        decline_reason = None
        if isinstance(body, dict) and "authorizationStatus" in body:
            ok = http_ok and int(body.get("authorizationStatus", 1)) == 0
            if not ok:
                decline_reason = body.get("responseMessage") or "declined"

        result = {
            "ok": ok,
            "step": step,
            "label": label,
            "status": r.status_code,
            "latency_ms": latency,
            "payload": payload,
            "response": body,
        }
        if decline_reason:
            result["decline_reason"] = decline_reason
        return result
    except Exception as exc:
        latency = round((time.monotonic() - t0) * 1000, 1)
        return {
            "ok": False,
            "step": step,
            "label": label,
            "status": 0,
            "latency_ms": latency,
            "payload": payload,
            "response": str(exc),
        }


async def run_scenario(config: dict) -> dict:
    """Run a single expense scenario end-to-end, returning ordered step results."""
    scenario = config.get("scenario", "settle")
    if scenario not in SCENARIOS:
        return {"ok": False, "error": f"Unknown scenario: {scenario}", "steps": []}

    auth_url  = config.get("auth_url") or DEFAULT_AUTH_URL
    notif_url = config.get("notification_url") or DEFAULT_NOTIF_URL
    headers   = config.get("auth_headers", {})
    txn_type  = config.get("txn_type", "card")       # card | upi
    amount    = float(config.get("amount", 5000))
    mcc       = str(config.get("mcc", "6011"))
    merchant  = config.get("merchant_name", "") or None
    card_ref  = str(config.get("card_ref", "") or "")
    payee_vpa = str(config.get("payee_vpa", "") or "test@upi")
    upi_type  = config.get("upi_txn_type", "P2P")
    upi_card_number = config.get("upi_card_number", "") or "6204430026865829"

    if not auth_url:
        return {"ok": False, "error": "No auth callback URL configured. Set TOOLGATE_PINELABS_AUTH_URL or supply auth_url.", "steps": []}

    is_upi = txn_type == "upi"
    steps = _STEPS[scenario]

    # Shared identifiers — link key must be identical across auth + notification.
    # Card link key = rrn; UPI link key = transactionUniqueId.
    rrn = gen_rrn()
    txn_unique_id = gen_txn_unique_id()
    # UPI debit MUST carry approvalCode on settle or the expense reverses.
    approval_code = gen_approval_code()

    if notif_url == "" and scenario in ("settle", "refund"):
        return {"ok": False, "error": "notification_url required for settle/refund", "steps": []}

    results: list[dict] = []
    async with httpx.AsyncClient() as client:
        for step in steps:
            if step == "auth":
                if is_upi:
                    payload = build_upi_auth(
                        payee_vpa, amount, txn_unique_id, mcc,
                        card_number=upi_card_number,
                    )
                    if merchant:
                        payload["merchantDetail"]["merchantName"] = merchant
                else:
                    payload = build_card_auth(card_ref, rrn, amount, txn_unique_id, mcc)
                    if merchant:
                        payload["merchantDetail"]["merchantName"] = merchant
                res = await _fire(client, auth_url, payload, headers, "auth", STEP_LABELS["auth"])
                results.append(res)
                # If the auth didn't approve, stop — later steps have nothing to settle.
                if not res["ok"]:
                    break

            elif step == "settle":
                # Let the async expense-generation job finish before settling.
                await asyncio.sleep(SETTLE_DELAY_SEC)
                notif_uid = gen_txn_unique_id()
                txn_time = gen_txn_time()
                if is_upi:
                    # UPI settle amount is used as-is (rupees) by the backend.
                    payload = build_upi_notification(
                        payee_vpa, amount, txn_unique_id, notif_uid, txn_time,
                        upi_type, mcc,
                        txn_type=int(TxnType.DEBIT), reason_code=0,
                        message="Transaction successful.",
                        card_number=upi_card_number,
                    )
                    # UPI settle requires approvalCode (else auto-reverses).
                    payload["transactionDetail"]["approvalCode"] = approval_code
                    if merchant:
                        payload["merchantDetail"]["merchantName"] = merchant
                else:
                    # Card notification amount is in PAISE (backend divides by 100
                    # to reconcile with the auth expense). Convert rupees → paise.
                    payload = build_card_notification(
                        card_ref, rrn, round(amount * 100), txn_unique_id, notif_uid, txn_time, mcc,
                        txn_type=int(TxnType.DEBIT), reason_code=0,
                        message="Transaction successful.",
                    )
                    if merchant:
                        payload["merchantDetail"]["merchantName"] = merchant
                res = await _fire(client, notif_url, payload, headers, "settle", STEP_LABELS["settle"])
                results.append(res)
                if not res["ok"]:
                    break

            elif step == "refund":
                # Space out from the prior settle so its processing completes.
                await asyncio.sleep(SETTLE_DELAY_SEC)
                notif_uid = gen_txn_unique_id()
                txn_time = gen_txn_time()
                # Refund type follows card-vs-UPI: 17 for card, 23 for UPI.
                refund_type = int(TxnType.UPI_REFUND) if is_upi else int(TxnType.REFUND)
                if is_upi:
                    payload = build_upi_notification(
                        payee_vpa, amount, txn_unique_id, notif_uid, txn_time,
                        upi_type, mcc,
                        txn_type=refund_type, reason_code=0,
                        message="Transaction is already cancelled.",
                        card_number=upi_card_number,
                    )
                    if merchant:
                        payload["merchantDetail"]["merchantName"] = merchant
                else:
                    # Card notification amount is in PAISE (see settle note).
                    payload = build_card_notification(
                        card_ref, rrn, round(amount * 100), txn_unique_id, notif_uid, txn_time, mcc,
                        txn_type=refund_type, reason_code=0,
                        message="Transaction is already cancelled.",
                    )
                    if merchant:
                        payload["merchantDetail"]["merchantName"] = merchant
                res = await _fire(client, notif_url, payload, headers, "refund", STEP_LABELS["refund"])
                results.append(res)

    # For decline, "ok" means the auth was actually rejected (non-2xx) as intended.
    if scenario == "decline":
        auth_res = results[0] if results else None
        overall_ok = bool(auth_res and not auth_res["ok"])
        note = ("Decline is engineered at auth — send an amount above the card/limit, "
                "or target a card configured to reject (block policy / low budget). "
                "A 2xx here means the card ALLOWED the expense (not declined).")
    else:
        overall_ok = all(r["ok"] for r in results) and bool(results)
        note = None
        if scenario in ("settle", "refund"):
            note = ("Callbacks were accepted (HTTP 2xx). The actual settlement runs "
                    "in a background worker inside Volopay — verify the expense's "
                    "final settlement_status in Volopay to confirm it settled.")

    return {
        "ok": overall_ok,
        "scenario": scenario,
        "txn_type": txn_type,
        "link_key": {"type": "rrn" if not is_upi else "transactionUniqueId",
                     "value": rrn if not is_upi else txn_unique_id},
        "steps": results,
        "note": note,
    }
