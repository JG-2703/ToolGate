"""Airwallex load test engine + dry-run helper."""
from __future__ import annotations

import time
import httpx

from airwallex_payload_builder import (
    build_authorization,
    build_success_notification,
    build_decline_notification,
    build_clearing_notification,
    build_merchant,
)

_active_run = False


def is_run_active() -> bool:
    return _active_run


def cancel_current_run():
    global _active_run
    _active_run = False


async def dry_run(config: dict) -> dict:
    """Fire one full authorization → success → clearing flow and return step results."""
    url = config.get("auth_url", "")
    headers = config.get("auth_headers", {}) or {}
    card_id = config.get("card_id") or "test-card-id"
    account_id = config.get("account_id") or "test-account-id"
    amount = float(config.get("amount_base", 100))
    flow_type = config.get("flow_type", "auth_success")

    merchant = build_merchant()
    results = {}
    overall_ok = True

    async with httpx.AsyncClient(timeout=15) as client:
        # Stage 1 — Authorization
        auth_payload = build_authorization(
            amount=amount,
            card_id=card_id,
            account_id=account_id,
            merchant=merchant,
        )
        lifecycle_id = auth_payload["lifecycle_id"]
        transaction_id = auth_payload["transaction_id"]
        auth_code = auth_payload["auth_code"]
        send_payload = {k: v for k, v in auth_payload.items() if k != "_meta"}

        t0 = time.time()
        try:
            resp = await client.post(url, json=send_payload, headers=headers)
            latency_ms = round((time.time() - t0) * 1000, 1)
            ok = resp.status_code < 300
            try:
                body = resp.text
            except Exception:
                body = ""
            results["authorization"] = {
                "ok": ok, "status": resp.status_code,
                "latency_ms": latency_ms, "body": body, "payload": send_payload,
            }
        except Exception as e:
            latency_ms = round((time.time() - t0) * 1000, 1)
            ok = False
            results["authorization"] = {
                "ok": False, "status": 0, "latency_ms": latency_ms,
                "body": str(e), "payload": send_payload,
            }
        if not ok:
            overall_ok = False

        if flow_type == "auth_only":
            return {"ok": overall_ok, "results": results}

        # Stage 2 — Auth result
        if flow_type == "auth_failed":
            notif_payload = build_decline_notification(
                amount=amount, lifecycle_id=lifecycle_id,
                transaction_id=transaction_id, card_id=card_id,
                account_id=account_id, merchant=merchant, auth_code=auth_code,
            )
            step_label = "declined"
        else:
            notif_payload = build_success_notification(
                amount=amount, lifecycle_id=lifecycle_id,
                transaction_id=transaction_id, card_id=card_id,
                account_id=account_id, merchant=merchant, auth_code=auth_code,
            )
            step_label = "success"

        t0 = time.time()
        try:
            resp = await client.post(url, json=notif_payload, headers=headers)
            latency_ms = round((time.time() - t0) * 1000, 1)
            ok2 = resp.status_code < 300
            results[step_label] = {
                "ok": ok2, "status": resp.status_code,
                "latency_ms": latency_ms, "body": resp.text, "payload": notif_payload,
            }
            if not ok2:
                overall_ok = False
        except Exception as e:
            results[step_label] = {
                "ok": False, "status": 0,
                "latency_ms": round((time.time() - t0) * 1000, 1),
                "body": str(e), "payload": notif_payload,
            }
            overall_ok = False

        if flow_type != "auth_success" or step_label == "declined":
            return {"ok": overall_ok, "results": results}

        # Stage 3 — Clearing (only on success)
        clearing_payload = build_clearing_notification(
            amount=amount, lifecycle_id=lifecycle_id,
            matched_auth_id=transaction_id, card_id=card_id,
            account_id=account_id, merchant=merchant,
        )
        t0 = time.time()
        try:
            resp = await client.post(url, json=clearing_payload, headers=headers)
            latency_ms = round((time.time() - t0) * 1000, 1)
            ok3 = resp.status_code < 300
            results["clearing"] = {
                "ok": ok3, "status": resp.status_code,
                "latency_ms": latency_ms, "body": resp.text, "payload": clearing_payload,
            }
            if not ok3:
                overall_ok = False
        except Exception as e:
            results["clearing"] = {
                "ok": False, "status": 0,
                "latency_ms": round((time.time() - t0) * 1000, 1),
                "body": str(e), "payload": clearing_payload,
            }
            overall_ok = False

    return {"ok": overall_ok, "results": results}


async def run_load_test(run_id, config, on_samples, on_metrics, on_complete, on_error):
    """Placeholder load test runner — not yet implemented."""
    global _active_run
    _active_run = True
    try:
        await on_error("Airwallex load test not yet implemented")
    finally:
        _active_run = False
