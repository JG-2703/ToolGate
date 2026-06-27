"""FastAPI app — REST API + WebSocket + static frontend."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import engine
import airwallex_engine
import models
from metrics import compute_metrics_snapshot, compute_txn_latency_series

STATIC_DIR = Path(__file__).parent / "static"
app = FastAPI(title="ToolGate", docs_url="/api/docs")

connected_ws: set[WebSocket] = set()
_current_run_id: Optional[str] = None


async def broadcast(msg: dict):
    dead = set()
    for ws in connected_ws:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.add(ws)
    connected_ws.difference_update(dead)


@app.on_event("startup")
async def startup():
    await models.init_db()


# ── Dry run ────────────────────────────────────────────────────────────────────

class DryRunRequest(BaseModel):
    auth_url: str
    notification_url: Optional[str] = None
    card_ref: str = ""
    card_refs: list[str] = []
    payee_vpa: str = ""
    payee_vpas: list[str] = []
    auth_headers: dict = {}
    callback_type: str = "both"
    txn_type: str = "card"           # card | upi | random
    mcc: str = "6011"                # card MCC
    upi_txn_type: str = "P2P"        # P2P | P2M
    upi_mcc_mode: str = "personal"   # personal | merchant | random
    upi_personal_ratio: float = 0.5  # fraction personal when mode=random
    upi_merchant_mcc: str = ""       # specific merchant MCC (blank = random from list)
    upi_card_number: str = ""
    upi_reference_number: str = ""
    amount_base: float = 100
    deadline_ms: float = 3000.0

class AirwallexDryRunRequest(BaseModel):
    auth_url: str
    auth_headers: dict = {}
    card_id: str = ""
    account_id: str = ""
    amount_base: float = 100
    flow_type: str = "auth_success"  # auth_only | auth_success | auth_failed

class AirwallexSingleRequest(BaseModel):
    url: str
    headers: dict = {}
    step: str  # "authorization" | "success" | "declined" | "clearing"
    card_id: str
    account_id: str
    amount: float = 100.0
    currency: str = "USD"
    # Required for steps 2+
    lifecycle_id: str = ""
    transaction_id: str = ""
    auth_code: str = ""
    decline_reason: str = ""
    # Merchant overrides (optional — defaults used if blank)
    merchant_name: str = ""
    merchant_id: str = ""
    merchant_city: str = ""
    merchant_country: str = ""
    merchant_category_code: str = ""

class AirwallexStartRunRequest(BaseModel):
    auth_url: str
    auth_headers: dict = {}
    card_id: str
    account_id: str
    total_txns: int = 100
    duration: int = 60
    concurrency: int = 10
    amount_base: float = 100
    amount_variance: float = 40
    success_rate: float = 95
    deadline_ms: float = 3000.0

@app.post("/api/dry-run")
async def api_dry_run(req: DryRunRequest):
    config = req.model_dump()
    result = await engine.dry_run(config)
    return result

@app.post("/api/airwallex/dry-run")
async def api_airwallex_dry_run(req: AirwallexDryRunRequest):
    config = req.model_dump()
    return await airwallex_engine.dry_run(config)

@app.post("/api/airwallex/single-step")
async def api_airwallex_single_step(req: AirwallexSingleRequest):
    """Send a single Airwallex step and return the payload + response."""
    import httpx
    import time
    from airwallex_payload_builder import (
        build_authorization, build_success_notification,
        build_decline_notification, build_clearing_notification,
        build_refund_notification, build_reversal_notification,
        build_merchant,
    )

    merchant = build_merchant(
        **({k: v for k, v in {
            "merchant_name": req.merchant_name,
            "merchant_id":   req.merchant_id,
            "city":          req.merchant_city,
            "country":       req.merchant_country,
            "category_code": req.merchant_category_code,
        }.items() if v})
    )

    if req.step == "authorization":
        payload = build_authorization(
            amount=req.amount,
            card_id=req.card_id,
            account_id=req.account_id,
            currency=req.currency,
            merchant=merchant,
        )
        meta = {
            "lifecycle_id": payload["lifecycle_id"],
            "transaction_id": payload["transaction_id"],
            "auth_code": payload["auth_code"],
        }
        # Remove internal meta from payload sent to server
        send_payload = {k: v for k, v in payload.items() if k != "_meta"}
    elif req.step == "success":
        if not req.lifecycle_id or not req.transaction_id:
            raise HTTPException(400, "lifecycle_id and transaction_id required for success step")
        payload = build_success_notification(
            amount=req.amount,
            lifecycle_id=req.lifecycle_id,
            transaction_id=req.transaction_id,
            card_id=req.card_id,
            account_id=req.account_id,
            currency=req.currency,
            merchant=merchant,
            auth_code=req.auth_code or None,
        )
        meta = {}
        send_payload = payload
    elif req.step == "declined":
        if not req.lifecycle_id or not req.transaction_id:
            raise HTTPException(400, "lifecycle_id and transaction_id required for declined step")
        payload = build_decline_notification(
            amount=req.amount,
            lifecycle_id=req.lifecycle_id,
            transaction_id=req.transaction_id,
            card_id=req.card_id,
            account_id=req.account_id,
            currency=req.currency,
            merchant=merchant,
            auth_code=req.auth_code or None,
            decline_reason=req.decline_reason or None,
        )
        meta = {}
        send_payload = payload
    elif req.step == "clearing":
        if not req.lifecycle_id or not req.transaction_id:
            raise HTTPException(400, "lifecycle_id and transaction_id required for clearing step")
        payload = build_clearing_notification(
            amount=req.amount,
            lifecycle_id=req.lifecycle_id,
            matched_auth_id=req.transaction_id,
            card_id=req.card_id,
            account_id=req.account_id,
            currency=req.currency,
            merchant=merchant,
        )
        meta = {}
        send_payload = payload
    elif req.step == "refund":
        if not req.lifecycle_id or not req.transaction_id:
            raise HTTPException(400, "lifecycle_id and transaction_id required for refund step")
        payload = build_refund_notification(
            amount=req.amount,
            lifecycle_id=req.lifecycle_id,
            matched_auth_id=req.transaction_id,
            card_id=req.card_id,
            account_id=req.account_id,
            currency=req.currency,
            merchant=merchant,
        )
        meta = {}
        send_payload = payload
    elif req.step == "reversal":
        if not req.lifecycle_id or not req.transaction_id:
            raise HTTPException(400, "lifecycle_id and transaction_id required for reversal step")
        payload = build_reversal_notification(
            amount=req.amount,
            lifecycle_id=req.lifecycle_id,
            matched_auth_id=req.transaction_id,
            card_id=req.card_id,
            account_id=req.account_id,
            currency=req.currency,
            merchant=merchant,
        )
        meta = {}
        send_payload = payload
    else:
        raise HTTPException(400, f"Unknown step: {req.step}")

    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(req.url, json=send_payload, headers=req.headers)
        latency_ms = round((time.time() - t0) * 1000, 1)
        try:
            resp_body = resp.json()
        except Exception:
            resp_body = resp.text
        return {
            "ok": resp.status_code < 300,
            "step": req.step,
            "status": resp.status_code,
            "latency_ms": latency_ms,
            "payload": send_payload,
            "response": resp_body,
            "meta": meta,
        }
    except Exception as e:
        latency_ms = round((time.time() - t0) * 1000, 1)
        return {
            "ok": False,
            "step": req.step,
            "status": 0,
            "latency_ms": latency_ms,
            "payload": send_payload,
            "response": str(e),
            "meta": meta,
        }


# ── Manual Clearing ────────────────────────────────────────────────────────────

class AirwallexSendClearingRequest(BaseModel):
    url: str
    headers: dict = {}
    lifecycle_id: str
    card_id: str
    amount: float
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA"
    # transaction_currency = the currency of the original transaction
    currency: str = "USD"
    # billing_currency = the card's settlement currency (defaults to currency if not set)
    # set this when card currency differs from transaction currency
    billing_currency: str = ""
    # transaction_id from the original authorization — used as matched_authorizations
    # fallback for find_expense when lifecycle_id lookup fails
    transaction_id: str = ""

@app.post("/api/airwallex/send-clearing")
async def api_airwallex_send_clearing(req: AirwallexSendClearingRequest):
    """Manually send a clearing notification for an existing transaction."""
    import httpx
    import time
    from airwallex_payload_builder import build_clearing_notification, build_merchant

    billing_currency = req.billing_currency or req.currency

    payload = build_clearing_notification(
        amount=req.amount,
        lifecycle_id=req.lifecycle_id,
        matched_auth_id=req.transaction_id or req.lifecycle_id,
        card_id=req.card_id,
        account_id=req.account_id,
        currency=req.currency,
        merchant=build_merchant(),
    )
    # Override billing_currency in the payload data if it differs from transaction currency
    payload["data"]["billing_currency"] = billing_currency
    payload["data"]["billing_amount"] = -abs(req.amount)

    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(req.url, json=payload, headers=req.headers)
        latency_ms = round((time.time() - t0) * 1000, 1)
        try:
            resp_body = resp.json()
        except Exception:
            resp_body = resp.text
        return {
            "ok": resp.status_code < 300,
            "status": resp.status_code,
            "latency_ms": latency_ms,
            "payload": payload,
            "response": resp_body,
        }
    except Exception as e:
        latency_ms = round((time.time() - t0) * 1000, 1)
        return {
            "ok": False,
            "status": 0,
            "latency_ms": latency_ms,
            "payload": payload,
            "response": str(e),
        }


# ── Load test ──────────────────────────────────────────────────────────────────

class StartRunRequest(BaseModel):
    auth_url: str
    notification_url: Optional[str] = None
    card_refs: list[str] = []
    card_ref: str = ""
    payee_vpas: list[str] = []
    payee_vpa: str = ""
    auth_headers: dict = {}
    callback_type: str = "both"       # auth_only | notification_only | both
    txn_type: str = "card"            # card | upi | random
    mcc: str = "6011"                 # card MCC
    upi_txn_type: str = "P2P"         # P2P | P2M
    upi_mcc_mode: str = "personal"    # personal | merchant | random
    upi_personal_ratio: float = 0.5
    upi_merchant_mcc: str = ""
    upi_card_number: str = ""
    upi_reference_number: str = ""
    total_txns: int = 100             # 0 = duration-based
    duration: int = 60                # used when total_txns == 0
    concurrency: int = 10
    amount_base: float = 100
    amount_variance: float = 40
    deadline_ms: float = 3000.0
    enable_sequences: bool = True
    load_mix: dict = {}

class AirwallexStartRunRequest(BaseModel):
    auth_url: str
    auth_headers: dict = {}
    card_id: str
    account_id: str
    total_txns: int = 100
    duration: int = 60
    concurrency: int = 10
    amount_base: float = 100
    amount_variance: float = 40
    success_rate: float = 95
    deadline_ms: float = 3000.0

@app.post("/api/runs/start")
async def start_run(req: StartRunRequest):
    global _current_run_id

    if engine.is_run_active():
        raise HTTPException(409, "A run is already in progress")

    config = req.model_dump()
    run_id = str(uuid.uuid4())
    _current_run_id = run_id
    await models.create_run(run_id, "pinelabs", config)
    await broadcast({"type": "run_started", "data": {"run_id": run_id}})

    async def on_samples(batch):
        await models.insert_samples_batch(run_id, batch)

    async def on_metrics(snap):
        await broadcast({"type": "metrics", "data": snap})

    async def on_complete(summary):
        status = "cancelled" if summary.get("cancelled") else "done"
        await models.finish_run(run_id, status, summary)
        await broadcast({"type": "run_complete", "data": {"run_id": run_id, "summary": summary}})

    async def on_error(msg):
        await models.finish_run(run_id, "error", error=msg)
        await broadcast({"type": "run_error", "data": {"reason": msg}})

    asyncio.create_task(
        engine.run_load_test(run_id, config, on_samples, on_metrics, on_complete, on_error)
    )
    return {"run_id": run_id}

@app.post("/api/airwallex/runs/start")
async def start_airwallex_run(req: AirwallexStartRunRequest):
    global _current_run_id

    if airwallex_engine.is_run_active():
        raise HTTPException(409, "An Airwallex run is already in progress")

    config = req.model_dump()

    run_id = str(uuid.uuid4())
    _current_run_id = run_id

    await models.create_run(
        run_id,
        "airwallex",
        config
    )

    await broadcast({
        "type": "run_started",
        "data": {
            "run_id": run_id,
            "provider": "airwallex",
        },
    })

    async def on_samples(batch):
        await models.insert_samples_batch(run_id, batch)

    async def on_metrics(snap):
        await broadcast({
            "type": "metrics",
            "data": snap,
        })

    async def on_complete(summary):
        status = "cancelled" if summary.get("cancelled") else "done"

        await models.finish_run(
            run_id,
            status,
            summary
        )

        await broadcast({
            "type": "run_complete",
            "data": {
                "run_id": run_id,
                "summary": summary,
                "provider": "airwallex",
            },
        })

    async def on_error(msg):
        await models.finish_run(
            run_id,
            "error",
            error=msg,
        )

        await broadcast({
            "type": "run_error",
            "data": {
                "reason": msg,
                "provider": "airwallex",
            },
        })

    asyncio.create_task(
        airwallex_engine.run_load_test(
            run_id,
            config,
            on_samples,
            on_metrics,
            on_complete,
            on_error,
        )
    )

    return {
        "run_id": run_id,
        "provider": "airwallex",
        "status": "started",
    }

@app.post("/api/runs/{run_id}/stop")
async def stop_run(run_id: str):
    if not engine.is_run_active():
        raise HTTPException(400, "No run is active")
    engine.cancel_current_run()
    return {"status": "cancelling"}


@app.get("/api/runs/active")
async def get_active():
    return {"active": engine.is_run_active(), "run_id": _current_run_id}


@app.get("/api/runs")
async def list_runs():
    rows = await models.list_runs()
    result = []
    for r in rows:
        r["config"]  = json.loads(r["config_json"])  if r["config_json"]  else {}
        r["summary"] = json.loads(r["summary_json"]) if r["summary_json"] else {}
        del r["config_json"], r["summary_json"]
        result.append(r)
    return result


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    r = await models.get_run(run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    r["config"]  = json.loads(r["config_json"])  if r["config_json"]  else {}
    r["summary"] = json.loads(r["summary_json"]) if r["summary_json"] else {}
    del r["config_json"], r["summary_json"]
    return r


@app.get("/api/runs/{run_id}/metrics")
async def get_run_metrics(run_id: str):
    r = await models.get_run(run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    samples  = await models.get_run_samples(run_id)
    elapsed  = (r["ended_at"] or 0) - r["started_at"]
    config = json.loads(r["config_json"]) if r["config_json"] else {}
    deadline_ms = float(config.get("deadline_ms", 3000.0))
    snap     = compute_metrics_snapshot(samples, elapsed, deadline_ms=deadline_ms)
    txn_series = compute_txn_latency_series(samples)
    return {**snap, "txn_series": txn_series}


@app.get("/api/runs/{run_id}/export")
async def export_run(run_id: str, format: str = "json"):
    r = await models.get_run(run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    samples = await models.get_run_samples(run_id)

    if format == "csv":
        fieldnames = [
            "step", "ts_offset_ms", "latency_ms", "status_code", "outcome_matched",
            "txn_type", "card_ref", "payee_vpa", "rrn", "amount", "mcc", "txn_unique_id",
        ]
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for s in samples:
            extra = s.get("extra") or {}
            row = {
                "step": s["step"],
                "ts_offset_ms": round(s["ts_offset_ms"], 1),
                "latency_ms": round(s["latency_ms"], 1),
                "status_code": s["status_code"],
                "outcome_matched": s["outcome_matched"],
                "txn_type": extra.get("txn_type", ""),
                "card_ref": extra.get("card_ref", ""),
                "payee_vpa": extra.get("payee_vpa", ""),
                "rrn": extra.get("rrn", ""),
                "amount": extra.get("amount", ""),
                "mcc": extra.get("mcc", ""),
                "txn_unique_id": extra.get("txn_unique_id", ""),
            }
            writer.writerow(row)
        return StreamingResponse(
            io.BytesIO(out.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=run_{run_id[:8]}.csv"},
        )

    payload = {
        "run_id": run_id,
        "started_at": r["started_at"],
        "ended_at": r["ended_at"],
        "status": r["status"],
        "config": json.loads(r["config_json"]) if r["config_json"] else {},
        "summary": json.loads(r["summary_json"]) if r["summary_json"] else {},
        "samples": samples,
    }
    return StreamingResponse(
        io.BytesIO(json.dumps(payload, indent=2).encode()),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=run_{run_id[:8]}.json"},
    )


# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws/metrics")
async def ws_metrics(ws: WebSocket):
    await ws.accept()
    connected_ws.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connected_ws.discard(ws)


# ── Static frontend ────────────────────────────────────────────────────────────

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
