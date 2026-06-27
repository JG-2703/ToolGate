"""Load engine — PineLabs card + UPI callback stress test."""
from __future__ import annotations

import asyncio
import json
import random
import time
from dataclasses import dataclass, field as dc_field
from collections import defaultdict
from datetime import datetime
from typing import Awaitable, Callable, Optional

import httpx

from metrics import compute_metrics_snapshot
from payload_builder import (
    build_card_auth, build_card_notification,
    build_upi_auth, build_upi_notification,
    gen_rrn, gen_txn_unique_id, gen_transaction_id,
    TxnType, NOTIF_MESSAGES,
)
from airwallex_payload_builder import (
    build_authorization,
    build_success_notification,
    build_decline_notification,
)

_run_active = False
_current_task: Optional[asyncio.Task] = None
_card_ref_idx = 0
_payee_vpa_idx = 0

# In-flight registry: card_ref -> list of approved debit records
@dataclass
class DebitRecord:
    txn_id: int
    card_ref: str
    payee_vpa: str | None
    amount: float
    mcc: str
    rrn: str | None
    created_at: float
    txn_unique_id: int

_registry: dict[str, list[DebitRecord]] = defaultdict(list)
_registry_lock: asyncio.Lock | None = None

def _get_registry_lock():
    global _registry_lock
    if _registry_lock is None:
        _registry_lock = asyncio.Lock()
    return _registry_lock

# Default production-derived load mix
DEFAULT_LOAD_MIX = {
    "debit_success_frac":      0.97,   # fraction of debits that should be approved
    "child_notif_frac":        0.03,   # fraction of txns that are child notifs (refund/reversal)
    "upi_refund_frac":         0.40,
    "refund_frac":             0.35,
    "cash_withdrawal_frac":    0.15,
    "reversal_frac":           0.08,
    "surcharge_reversal_frac": 0.02,
}

# Merchant MCCs used when UPI mcc_mode != "personal"
UPI_MERCHANT_MCCS = [
    "5411",  # grocery
    "5812",  # restaurant
    "4722",  # travel agent
    "5045",  # electronics
    "5912",  # pharmacy
    "7011",  # hotel
    "5311",  # dept store
    "4121",  # taxi / Ola / Uber
    "5999",  # misc retail
    "6300",  # insurance
]


def is_run_active() -> bool:
    return _run_active


def cancel_current_run():
    global _current_task
    if _current_task and not _current_task.done():
        _current_task.cancel()


def _next_item(lst: list, which: str) -> str:
    global _card_ref_idx, _payee_vpa_idx
    if not lst:
        return ""
    if which == "card":
        ref = lst[_card_ref_idx % len(lst)]
        _card_ref_idx += 1
    else:
        ref = lst[_payee_vpa_idx % len(lst)]
        _payee_vpa_idx += 1
    return str(ref)


def _pick_upi_mcc(mcc_mode: str, personal_ratio: float, custom_mcc: str = "") -> tuple[str, bool]:
    """Returns (mcc, is_personal).
    is_personal=True  → MCC 0000, Volopay should BLOCK  (intended_pass=False)
    is_personal=False → merchant MCC, Volopay should ALLOW (intended_pass=True)
    """
    if mcc_mode == "personal":
        return "0000", True
    if mcc_mode == "merchant":
        mcc = custom_mcc if custom_mcc and custom_mcc != "0000" else random.choice(UPI_MERCHANT_MCCS)
        return mcc, False
    # random — flip weighted coin
    is_personal = random.random() < personal_ratio
    if is_personal:
        return "0000", True
    mcc = custom_mcc if custom_mcc and custom_mcc != "0000" else random.choice(UPI_MERCHANT_MCCS)
    return mcc, False


# ── dry run ────────────────────────────────────────────────────────────────────

async def dry_run(config: dict) -> dict:
    auth_url        = config["auth_url"]
    notif_url       = config.get("notification_url") or ""
    headers         = config.get("auth_headers", {})
    cb_type         = config.get("callback_type", "both")
    txn_type        = config.get("txn_type", "card")
    amount          = float(config.get("amount_base", 100))
    card_mcc        = str(config.get("mcc", "6011"))
    upi_type        = config.get("upi_txn_type", "P2P")
    upi_mcc_mode    = config.get("upi_mcc_mode", "personal")  # personal | merchant | random
    personal_ratio  = float(config.get("upi_personal_ratio", 0.5))
    custom_upi_mcc  = str(config.get("upi_merchant_mcc", ""))
    upi_card_number      = config.get("upi_card_number", "") or "6204430026865829"
    upi_reference_number = config.get("upi_reference_number", "") or None

    card_refs  = config.get("card_refs", [])
    payee_vpas = config.get("payee_vpas", [])
    card_ref   = _next_item(card_refs, "card") if card_refs else config.get("card_ref", "")
    payee_vpa  = _next_item(payee_vpas, "upi") if payee_vpas else config.get("payee_vpa", "test@upi")

    if txn_type == "random":
        txn_type = random.choice(["card", "upi"])

    # For UPI, pick MCC based on mode
    upi_mcc, is_personal = _pick_upi_mcc(upi_mcc_mode, personal_ratio, custom_upi_mcc)

    rrn           = gen_rrn()
    txn_unique_id = gen_txn_unique_id()
    txn_time      = datetime.now().strftime("%m/%d/%Y %H:%M:%S")
    results       = {}

    async with httpx.AsyncClient(timeout=15.0) as client:
        if cb_type in ("auth_only", "both"):
            if txn_type == "upi":
                payload = build_upi_auth(payee_vpa, amount, txn_unique_id, upi_mcc,
                                         card_number=upi_card_number,
                                         reference_number=upi_reference_number)
            else:
                payload = build_card_auth(card_ref, rrn, amount, txn_unique_id, card_mcc)
            t0 = time.monotonic()
            try:
                r = await client.post(auth_url, json=payload, headers=headers)
                results["auth"] = {
                    "ok": 200 <= r.status_code < 300,
                    "status": r.status_code,
                    "latency_ms": round((time.monotonic() - t0) * 1000, 1),
                    "body": r.text[:1000],
                    "payload": payload,
                }
            except Exception as exc:
                results["auth"] = {"ok": False, "status": 0, "latency_ms": 0, "body": str(exc), "payload": {}}

        auth_ok = results.get("auth", {}).get("ok", True)

        if cb_type in ("notification_only", "both") and notif_url:
            if cb_type == "both" and not auth_ok:
                results["notification"] = {
                    "ok": False, "status": 0, "latency_ms": 0,
                    "body": "Skipped — auth failed", "payload": {},
                }
            else:
                notif_uid = gen_txn_unique_id()
                if txn_type == "upi":
                    payload = build_upi_notification(payee_vpa, amount, txn_unique_id, notif_uid, txn_time, upi_type, upi_mcc)
                else:
                    payload = build_card_notification(card_ref, rrn, amount, txn_unique_id, notif_uid, txn_time, card_mcc)
                t0 = time.monotonic()
                try:
                    r = await client.post(notif_url, json=payload, headers=headers)
                    results["notification"] = {
                        "ok": 200 <= r.status_code < 300,
                        "status": r.status_code,
                        "latency_ms": round((time.monotonic() - t0) * 1000, 1),
                        "body": r.text[:1000],
                        "payload": payload,
                    }
                except Exception as exc:
                    results["notification"] = {"ok": False, "status": 0, "latency_ms": 0, "body": str(exc), "payload": {}}

    overall_ok = all(v["ok"] for v in results.values()) and bool(results)
    return {
        "ok": overall_ok,
        "results": results,
        "card_ref": card_ref if txn_type == "card" else None,
        "payee_vpa": payee_vpa if txn_type == "upi" else None,
        "rrn": rrn if txn_type == "card" else None,
        "txn_type": txn_type,
        "mcc": upi_mcc if txn_type == "upi" else card_mcc,
        "is_personal": is_personal if txn_type == "upi" else None,
        "expected": "BLOCK" if (txn_type == "upi" and is_personal) else "ALLOW",
    }


# ── load test ──────────────────────────────────────────────────────────────────

async def run_load_test(
    run_id: str,
    config: dict,
    on_samples: Callable[[list[dict]], Awaitable[None]],
    on_metrics: Callable[[dict], Awaitable[None]],
    on_complete: Callable[[dict], Awaitable[None]],
    on_error: Callable[[str], Awaitable[None]],
):
    global _run_active, _current_task
    if _run_active:
        await on_error("A run is already active")
        return

    _run_active = True
    _current_task = asyncio.current_task()

    auth_url        = config["auth_url"]
    notif_url       = config.get("notification_url") or ""
    headers         = config.get("auth_headers", {})
    cb_type         = config.get("callback_type", "both")
    txn_type        = config.get("txn_type", "card")
    card_mcc        = str(config.get("mcc", "6011"))
    upi_type        = config.get("upi_txn_type", "P2P")
    upi_mcc_mode    = config.get("upi_mcc_mode", "personal")
    personal_ratio  = float(config.get("upi_personal_ratio", 0.5))
    custom_upi_mcc  = str(config.get("upi_merchant_mcc", ""))
    upi_card_number      = config.get("upi_card_number", "") or "6204430026865829"
    upi_reference_number = config.get("upi_reference_number", "") or None
    concurrency     = int(config.get("concurrency", 10))
    total_txns      = int(config.get("total_txns", 0))
    duration        = float(config.get("duration", 60))
    amount_base     = float(config.get("amount_base", 100))
    amount_var      = float(config.get("amount_variance", 40))
    card_refs       = config.get("card_refs", [])
    payee_vpas      = config.get("payee_vpas", [])
    deadline_ms     = float(config.get("deadline_ms", 3000.0))
    enable_sequences = bool(config.get("enable_sequences", True))
    load_mix        = {**DEFAULT_LOAD_MIX, **config.get("load_mix", {})}
    child_notif_frac = load_mix["child_notif_frac"]
    _registry.clear()

    def _pick_card_ref() -> str:
        return _next_item(card_refs, "card") if card_refs else config.get("card_ref", "9999999999")

    def _pick_payee_vpa() -> str:
        return _next_item(payee_vpas, "upi") if payee_vpas else config.get("payee_vpa", "test@upi")

    def _pick_txn_type() -> str:
        return random.choice(["card", "upi"]) if txn_type == "random" else txn_type

    def _gen_amount() -> float:
        lo = max(0.01, amount_base - amount_var)
        hi = amount_base + amount_var
        return round(random.uniform(lo, hi), 2)

    all_samples: list[dict] = []
    pending: list[dict] = []
    flush_lock = asyncio.Lock()
    run_start = time.monotonic()
    txn_counter = [0]
    counter_lock = asyncio.Lock()

    async def flush():
        nonlocal pending
        async with flush_lock:
            if pending:
                batch = pending[:]
                pending = []
                await on_samples(batch)
                all_samples.extend(batch)

    async def push_metrics_loop():
        while True:
            await asyncio.sleep(0.5)
            elapsed = time.monotonic() - run_start
            snap = compute_metrics_snapshot(all_samples + pending, elapsed, deadline_ms=deadline_ms)
            await on_metrics(snap)

    def _record(step, ts_offset_ms, latency_ms, status_code, intended_pass: bool, extra: dict, deadline_ms: float = 3000.0) -> dict:
        got_2xx = 200 <= status_code < 300
        # outcome_matched: we got what we expected
        # intended_pass=True  → we expect 2xx → matched if 2xx
        # intended_pass=False → we expect block (non-2xx) → matched if non-2xx
        outcome_matched = got_2xx if intended_pass else not got_2xx
        return {
            "step": step,
            "ts_offset_ms": ts_offset_ms,
            "latency_ms": latency_ms,
            "status_code": status_code,
            "intended_pass": intended_pass,
            "outcome_matched": outcome_matched,
            "deadline_breach": latency_ms > deadline_ms,
            "extra": extra,
        }

    def _pick_child_txn_type() -> int:
        r = random.random()
        mx = load_mix
        if r < mx["upi_refund_frac"]:
            return int(TxnType.UPI_REFUND)
        r -= mx["upi_refund_frac"]
        if r < mx["refund_frac"]:
            return int(TxnType.REFUND)
        r -= mx["refund_frac"]
        if r < mx["cash_withdrawal_frac"]:
            return int(TxnType.CASH_WITHDRAWAL)
        r -= mx["cash_withdrawal_frac"]
        if r < mx["reversal_frac"]:
            return int(TxnType.REVERSAL)
        return int(TxnType.SURCHARGE_REVERSAL)

    async def run_txn(client: httpx.AsyncClient):
        lock = _get_registry_lock()
        # Try to fire a child notification (stateful sequence)
        if enable_sequences and notif_url and cb_type in ("notification_only", "both"):
            async with lock:
                all_debits = [d for debits in _registry.values() for d in debits]
            if all_debits and random.random() < child_notif_frac:
                parent = random.choice(all_debits)
                child_type = _pick_child_txn_type()
                reason_code = 5 if child_type == int(TxnType.REVERSAL) else 0
                msg_key = "already_cancelled" if child_type in (int(TxnType.REFUND), int(TxnType.UPI_REFUND)) else "success"
                message = NOTIF_MESSAGES[msg_key]
                notif_uid = gen_txn_unique_id()
                txn_time_str = datetime.now().strftime("%m/%d/%Y %H:%M:%S")

                if parent.payee_vpa:
                    payload = build_upi_notification(
                        parent.payee_vpa, parent.amount, parent.txn_unique_id,
                        notif_uid, txn_time_str, upi_type, parent.mcc,
                        txn_type=child_type, reason_code=reason_code, message=message,
                    )
                else:
                    payload = build_card_notification(
                        parent.card_ref, parent.rrn or gen_rrn(), parent.amount,
                        parent.txn_unique_id, notif_uid, txn_time_str, parent.mcc,
                        txn_type=child_type, reason_code=reason_code, message=message,
                    )

                ts_off = (time.monotonic() - run_start) * 1000
                t0 = time.monotonic()
                try:
                    r = await client.post(notif_url, json=payload, headers=headers, timeout=30.0)
                    status = r.status_code
                except Exception:
                    status = 0
                lat = (time.monotonic() - t0) * 1000
                child_extra = {
                    "txn_type": "card" if not parent.payee_vpa else "upi",
                    "notif_type": child_type,
                    "card_ref": parent.card_ref,
                    "payee_vpa": parent.payee_vpa,
                    "rrn": parent.rrn,
                    "amount": parent.amount,
                    "mcc": parent.mcc,
                    "is_personal": False,
                    "txn_unique_id": parent.txn_unique_id,
                    "parent_ref": parent.card_ref,
                }
                async with flush_lock:
                    pending.append(_record("child_notif", ts_off, lat, status, True, child_extra, deadline_ms))
                return

        eff_type  = _pick_txn_type()
        amount    = _gen_amount()
        txn_uid   = gen_txn_unique_id()
        txn_time  = datetime.now().strftime("%m/%d/%Y %H:%M:%S")

        if eff_type == "upi":
            payee_vpa   = _pick_payee_vpa()
            card_ref    = None
            rrn         = None
            eff_mcc, is_personal = _pick_upi_mcc(upi_mcc_mode, personal_ratio, custom_upi_mcc)
            intended    = not is_personal  # personal → expect block, merchant → expect pass
        else:
            card_ref    = _pick_card_ref()
            payee_vpa   = None
            rrn         = gen_rrn()
            eff_mcc     = card_mcc
            is_personal = False
            intended    = True

        base_extra = {
            "txn_type": eff_type,
            "card_ref": card_ref,
            "payee_vpa": payee_vpa,
            "rrn": rrn,
            "amount": amount,
            "mcc": eff_mcc,
            "is_personal": is_personal,
            "txn_unique_id": txn_uid,
            "decline_reason": "",
        }

        auth_ok = True
        if cb_type in ("auth_only", "both"):
            if eff_type == "upi":
                payload = build_upi_auth(payee_vpa, amount, txn_uid, eff_mcc,
                                         card_number=upi_card_number,
                                         reference_number=upi_reference_number)
            else:
                payload = build_card_auth(card_ref, rrn, amount, txn_uid, eff_mcc)

            ts_off = (time.monotonic() - run_start) * 1000
            t0 = time.monotonic()
            try:
                r = await client.post(auth_url, json=payload, headers=headers, timeout=30.0)
                status = r.status_code
                try:
                    resp_body = r.text
                    if status >= 400:
                        body_data = json.loads(resp_body)
                        decline_reason = body_data.get("reason_code") or body_data.get("decline_reason") or ""
                    else:
                        decline_reason = ""
                except Exception:
                    decline_reason = ""
            except Exception:
                status = 0
                decline_reason = ""
            latency = (time.monotonic() - t0) * 1000
            auth_ok = 200 <= status < 300
            base_extra["decline_reason"] = decline_reason
            async with flush_lock:
                pending.append(_record("auth", ts_off, latency, status, intended, base_extra, deadline_ms))

            if auth_ok and enable_sequences:
                rec = DebitRecord(
                    txn_id=gen_transaction_id(), card_ref=card_ref or "", payee_vpa=payee_vpa,
                    amount=amount, mcc=eff_mcc, rrn=rrn, created_at=time.monotonic(),
                    txn_unique_id=txn_uid,
                )
                async with _get_registry_lock():
                    _registry[card_ref or payee_vpa or ""].append(rec)
                    # Cap registry size per key to avoid memory growth
                    if len(_registry[card_ref or payee_vpa or ""]) > 50:
                        _registry[card_ref or payee_vpa or ""] = _registry[card_ref or payee_vpa or ""][-50:]

        if cb_type in ("notification_only", "both") and notif_url:
            if cb_type == "both" and not auth_ok:
                return
            notif_uid = gen_txn_unique_id()
            if eff_type == "upi":
                payload = build_upi_notification(payee_vpa, amount, txn_uid, notif_uid, txn_time, upi_type, eff_mcc)
            else:
                payload = build_card_notification(card_ref, rrn, amount, txn_uid, notif_uid, txn_time, eff_mcc)

            ts_off = (time.monotonic() - run_start) * 1000
            t0 = time.monotonic()
            try:
                r = await client.post(notif_url, json=payload, headers=headers, timeout=30.0)
                status = r.status_code
            except Exception:
                status = 0
            latency = (time.monotonic() - t0) * 1000
            async with flush_lock:
                pending.append(_record("confirm", ts_off, latency, status, intended, {**base_extra, "notif_uid": notif_uid}, deadline_ms))

    async def worker(deadline: float):
        while True:
            async with counter_lock:
                if total_txns > 0 and txn_counter[0] >= total_txns:
                    break
                if total_txns == 0 and time.monotonic() >= deadline:
                    break
                txn_counter[0] += 1
            await run_txn(client)

    deadline = run_start + duration
    limits = httpx.Limits(max_connections=concurrency + 10, max_keepalive_connections=concurrency)

    metrics_task = asyncio.create_task(push_metrics_loop())
    try:
        async with httpx.AsyncClient(limits=limits) as client:
            async def flusher():
                while True:
                    await asyncio.sleep(2.0)
                    await flush()

            flush_task = asyncio.create_task(flusher())
            try:
                await asyncio.gather(
                    *[asyncio.create_task(worker(deadline)) for _ in range(concurrency)],
                    return_exceptions=True,
                )
            finally:
                flush_task.cancel()
                try: await flush_task
                except asyncio.CancelledError: pass
        await flush()

    except asyncio.CancelledError:
        metrics_task.cancel()
        await flush()
        elapsed = time.monotonic() - run_start
        final = compute_metrics_snapshot(all_samples, elapsed, deadline_ms=deadline_ms)
        await on_complete({**final, "cancelled": True})
        _run_active = False
        return
    except Exception as exc:
        metrics_task.cancel()
        _run_active = False
        await on_error(str(exc))
        return
    finally:
        metrics_task.cancel()
        try: await metrics_task
        except asyncio.CancelledError: pass

    elapsed = time.monotonic() - run_start
    final = compute_metrics_snapshot(all_samples, elapsed, deadline_ms=deadline_ms)
    await on_complete({**final, "cancelled": False})
    _run_active = False
