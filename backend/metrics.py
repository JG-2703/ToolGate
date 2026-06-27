from __future__ import annotations


def percentile(sorted_data: list[float], p: float) -> float:
    if not sorted_data:
        return 0.0
    n = len(sorted_data)
    if n == 1:
        return sorted_data[0]
    idx = (p / 100.0) * (n - 1)
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    return sorted_data[lo] + (sorted_data[hi] - sorted_data[lo]) * (idx - lo)


def compute_percentiles(latencies: list[float]) -> dict:
    if not latencies:
        return {"p50": 0, "p90": 0, "p95": 0, "p99": 0, "min": 0, "max": 0, "mean": 0, "count": 0}
    s = sorted(latencies)
    n = len(s)
    return {
        "p50": round(percentile(s, 50), 2),
        "p90": round(percentile(s, 90), 2),
        "p95": round(percentile(s, 95), 2),
        "p99": round(percentile(s, 99), 2),
        "min": round(s[0], 2),
        "max": round(s[-1], 2),
        "mean": round(sum(s) / n, 2),
        "count": n,
    }


def compute_cdf(latencies: list[float], buckets: int = 200) -> list[dict]:
    if not latencies:
        return []
    s = sorted(latencies)
    n = len(s)
    result = []
    for i in range(buckets + 1):
        p = i / buckets
        idx = min(int(p * n), n - 1)
        result.append({"pct": round(p * 100, 1), "latency_ms": round(s[idx], 2)})
    return result


def _bucket_group(samples: list[dict]) -> dict:
    latencies = [s["latency_ms"] for s in samples]
    total = len(samples)
    if not total:
        return {**compute_percentiles([]), "success_rate": 0, "outcome_match_rate": 0}
    success = sum(1 for s in samples if 200 <= s["status_code"] < 300)
    matched = sum(1 for s in samples if s["outcome_matched"])
    return {
        **compute_percentiles(latencies),
        "success_rate": round(success / total * 100, 2),
        "outcome_match_rate": round(matched / total * 100, 2),
    }


def compute_wall_clock_buckets(samples: list[dict], elapsed: float) -> list[dict]:
    if not samples or elapsed <= 0:
        return []
    bucket_size = max(1.0, elapsed / 120)
    buckets: dict[float, dict] = {}
    for s in samples:
        b = round(int(s["ts_offset_ms"] / 1000 / bucket_size) * bucket_size, 1)
        if b not in buckets:
            buckets[b] = {"auth": [], "confirm": []}
        key = s["step"] if s["step"] in ("auth", "confirm") else "auth"
        buckets[b][key].append(s["latency_ms"])

    result = []
    for t in sorted(buckets):
        auth_s = sorted(buckets[t]["auth"])
        conf_s = sorted(buckets[t]["confirm"])
        result.append({
            "t": t,
            "auth_p50": round(percentile(auth_s, 50), 2) if auth_s else None,
            "auth_p95": round(percentile(auth_s, 95), 2) if auth_s else None,
            "auth_p99": round(percentile(auth_s, 99), 2) if auth_s else None,
            "confirm_p50": round(percentile(conf_s, 50), 2) if conf_s else None,
            "confirm_p95": round(percentile(conf_s, 95), 2) if conf_s else None,
            "confirm_p99": round(percentile(conf_s, 99), 2) if conf_s else None,
        })
    return result


def compute_txn_latency_series(samples: list[dict]) -> dict:
    """Bucket by txn index (every 50 txns) for the txn-vs-latency chart."""
    auth_samples = sorted([s for s in samples if s["step"] == "auth"], key=lambda x: x["ts_offset_ms"])
    conf_samples = sorted([s for s in samples if s["step"] == "confirm"], key=lambda x: x["ts_offset_ms"])

    def bucket(slist, bucket_size=50):
        result = []
        for i in range(0, len(slist), bucket_size):
            chunk = slist[i:i + bucket_size]
            lats = sorted([s["latency_ms"] for s in chunk])
            result.append({
                "txn": i + bucket_size,
                "p50": round(percentile(lats, 50), 2),
                "p95": round(percentile(lats, 95), 2),
                "p99": round(percentile(lats, 99), 2),
            })
        return result

    return {"auth": bucket(auth_samples), "confirm": bucket(conf_samples)}


def compute_metrics_snapshot(samples: list[dict], elapsed: float, deadline_ms: float = 3000.0) -> dict:
    if not samples:
        return {
            "total_txns": 0, "throughput": 0.0, "elapsed": round(elapsed, 1),
            "success_rate": 0.0, "outcome_match_rate": 0.0,
            "auth": {"all": compute_percentiles([]), "pass": compute_percentiles([]), "fail": compute_percentiles([])},
            "confirm": {"all": compute_percentiles([]), "pass": compute_percentiles([]), "fail": compute_percentiles([])},
            "wall_clock": [], "cdf": {"auth": [], "confirm": []},
            "deadline_breach_rate": 0.0,
            "decline_mix": {},
        }

    auth_all = [s for s in samples if s["step"] == "auth"]
    conf_all = [s for s in samples if s["step"] == "confirm"]
    total_txns = len(auth_all)
    throughput = round(total_txns / elapsed, 2) if elapsed > 0 else 0.0

    all_success = sum(1 for s in samples if 200 <= s["status_code"] < 300)
    all_matched = sum(1 for s in samples if s["outcome_matched"])
    total = len(samples)

    deadline_breaches = sum(1 for s in samples if s.get("deadline_breach") or s["latency_ms"] > deadline_ms)
    deadline_breach_rate = round(deadline_breaches / total * 100, 2) if total else 0.0

    # Decline mix from extra data
    decline_mix: dict[str, int] = {}
    for s in samples:
        dr = (s.get("extra") or {}).get("decline_reason", "")
        if dr:
            decline_mix[dr] = decline_mix.get(dr, 0) + 1

    return {
        "total_txns": total_txns,
        "throughput": throughput,
        "elapsed": round(elapsed, 1),
        "success_rate": round(all_success / total * 100, 2) if total else 0,
        "outcome_match_rate": round(all_matched / total * 100, 2) if total else 0,
        "auth": {
            "all": _bucket_group(auth_all),
            "pass": _bucket_group([s for s in auth_all if s["intended_pass"]]),
            "fail": _bucket_group([s for s in auth_all if not s["intended_pass"]]),
        },
        "confirm": {
            "all": _bucket_group(conf_all),
            "pass": _bucket_group([s for s in conf_all if s["intended_pass"]]),
            "fail": _bucket_group([s for s in conf_all if not s["intended_pass"]]),
        },
        "wall_clock": compute_wall_clock_buckets(samples, elapsed),
        "cdf": {
            "auth": compute_cdf([s["latency_ms"] for s in auth_all]),
            "confirm": compute_cdf([s["latency_ms"] for s in conf_all]),
        },
        "deadline_breach_rate": deadline_breach_rate,
        "decline_mix": decline_mix,
    }
