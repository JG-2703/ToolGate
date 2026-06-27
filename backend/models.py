import json
import os
import time
from typing import Optional

import aiosqlite

DB_PATH = os.environ.get("TOOLGATE_DB_PATH", "/data/toolgate.db")


CREATE_RUNS = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    started_at REAL NOT NULL,
    ended_at REAL,
    config_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    summary_json TEXT,
    error TEXT
)
"""

CREATE_SAMPLES = """
CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    step TEXT NOT NULL,
    ts_offset_ms REAL NOT NULL,
    latency_ms REAL NOT NULL,
    status_code INTEGER NOT NULL,
    intended_pass INTEGER NOT NULL,
    outcome_matched INTEGER NOT NULL,
    extra_json TEXT
)
"""


async def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_RUNS)
        await db.execute(CREATE_SAMPLES)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_samples_run ON samples(run_id, step)"
        )
        # graceful migration — add extra_json if upgrading from older schema
        try:
            await db.execute("ALTER TABLE samples ADD COLUMN extra_json TEXT")
        except Exception:
            pass
        await db.commit()


async def create_run(run_id: str, profile_id: str, config: dict) -> dict:
    started_at = time.time()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO runs (id, profile_id, started_at, config_json, status) VALUES (?,?,?,?,?)",
            (run_id, profile_id, started_at, json.dumps(config), "running"),
        )
        await db.commit()
    return {"id": run_id, "profile_id": profile_id, "started_at": started_at, "status": "running"}


async def insert_samples_batch(run_id: str, samples: list[dict]):
    if not samples:
        return
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executemany(
            "INSERT INTO samples "
            "(run_id,step,ts_offset_ms,latency_ms,status_code,intended_pass,outcome_matched,extra_json) "
            "VALUES (?,?,?,?,?,?,?,?)",
            [
                (
                    run_id,
                    s["step"],
                    s["ts_offset_ms"],
                    s["latency_ms"],
                    s["status_code"],
                    int(s["intended_pass"]),
                    int(s["outcome_matched"]),
                    json.dumps(s.get("extra")) if s.get("extra") else None,
                )
                for s in samples
            ],
        )
        await db.commit()


async def finish_run(
    run_id: str, status: str, summary: Optional[dict] = None, error: Optional[str] = None
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE runs SET ended_at=?, status=?, summary_json=?, error=? WHERE id=?",
            (time.time(), status, json.dumps(summary) if summary else None, error, run_id),
        )
        await db.commit()


async def list_runs(limit: int = 100) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id,profile_id,started_at,ended_at,config_json,status,summary_json,error "
            "FROM runs ORDER BY started_at DESC LIMIT ?",
            (limit,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_run(run_id: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM runs WHERE id=?", (run_id,)) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


async def get_run_samples(run_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT step,ts_offset_ms,latency_ms,status_code,intended_pass,outcome_matched,extra_json "
            "FROM samples WHERE run_id=? ORDER BY ts_offset_ms",
            (run_id,),
        ) as cur:
            rows = await cur.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["extra"] = json.loads(d.pop("extra_json")) if d.get("extra_json") else {}
        result.append(d)
    return result
