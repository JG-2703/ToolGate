import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { WallClockChart } from "../components/WallClockChart";

const STAGING_AUTH_URL =
  "https://main.apis.volopay.site/api/v1/callbacks/pinelabs-authorize";
const STAGING_NOTIF_URL =
  "https://main.apis.volopay.site/api/v1/callbacks/pinelabs-txn-notifications";

const MCC_LABELS = {
  "0000": "UPI personal",
  6011: "ATM / cash",
  5411: "grocery",
  5912: "pharmacy",
  4722: "travel agent",
  5812: "restaurant",
  5999: "misc retail",
  7995: "gambling",
  6051: "crypto / FX",
  5045: "electronics",
  4121: "taxi / rideshare",
  7011: "hotel",
};

const DECLINE_COLORS = {
  low_account_balance: "#f6821f",
  low_card_balance: "#f85149",
  transaction_limit_breach: "#d29922",
  low_budget_balance: "#58a6ff",
  upi_activation_limit_breach: "#3fb950",
  upi_merchant_not_allowed: "#9aa7b8",
};

function deriveNotifUrl(authUrl) {
  if (!authUrl) return "";
  return authUrl
    .replace("pinelabs-authorize", "pinelabs-txn-notifications")
    .replace("/authorize", "/txn-notifications");
}
function parseList(text) {
  return text
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}
function parseHeaders(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

// ── components ────────────────────────────────────────────────────────────────

function Field({ label, tip, children }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 4,
        }}
      >
        <span className="label">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      {children}
    </div>
  );
}

function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid var(--border-strong)",
          color: "var(--text-muted)",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          cursor: "default",
          fontFamily: "JetBrains Mono, monospace",
        }}
        tabIndex={-1}
      >
        i
      </button>
      {show && (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            left: 20,
            top: 0,
            width: 260,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-secondary)",
            fontSize: 11,
            padding: "10px 12px",
            fontFamily: "JetBrains Mono, monospace",
            lineHeight: 1.6,
            boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

function SegControl({ options, value, onChange, disabled }) {
  return (
    <div
      style={{
        display: "flex",
        border: "1px solid var(--border-strong)",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "7px 4px",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            borderRight: "1px solid var(--border-strong)",
            background: value === opt.value ? "var(--accent)" : "transparent",
            color: value === opt.value ? "#fff" : "var(--text-muted)",
            transition: "all 0.12s",
            cursor: "pointer",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function StatNum({ label, value, sub, flash, danger }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        padding: "12px 14px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="label">{label}</div>
      <div
        key={value}
        className={flash ? "stat-flash" : ""}
        style={{
          fontSize: 26,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          color: danger ? "var(--danger)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
        }}
      >
        {value ?? "—"}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 2,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border-subtle)",
        paddingBottom: 8,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function LiveTicker({
  metrics,
  isRunning,
  txnType,
  amountBase,
  amountVariance,
}) {
  const [feed, setFeed] = useState([]);
  const prevTotal = useRef(0);
  const idRef = useRef(0);

  useEffect(() => {
    if (!metrics) return;
    const cur = metrics.total_txns ?? 0;
    const delta = Math.min(cur - prevTotal.current, 8);
    prevTotal.current = cur;
    if (delta <= 0) return;
    const sr = metrics.success_rate ?? 100;
    const newRows = Array.from({ length: delta }, () => {
      const eff =
        txnType === "random"
          ? Math.random() > 0.5
            ? "UPI"
            : "CARD"
          : txnType.toUpperCase();
      const amt = Math.max(
        1,
        amountBase + (Math.random() * 2 - 1) * amountVariance
      );
      const pass = Math.random() * 100 < sr;
      const types = ["DEBIT", "DEBIT", "DEBIT", "DEBIT", "REFUND", "REVERSAL"];
      const ttype = types[Math.floor(Math.random() * types.length)];
      return { id: idRef.current++, eff, amt: Math.round(amt), pass, ttype };
    });
    setFeed((prev) => [...newRows, ...prev].slice(0, 20));
  }, [metrics?.total_txns]);

  if (!isRunning && feed.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-muted)",
          }}
        >
          LIVE FEED
        </span>
        {isRunning && (
          <span
            className="running-dot"
            style={{ color: "var(--ok)", marginLeft: "auto" }}
          />
        )}
      </div>
      <div>
        {feed.map((row, i) => (
          <div
            key={row.id}
            className="ticker-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "6px 16px",
              fontSize: 12,
              fontFamily: "JetBrains Mono, monospace",
              borderBottom: "1px solid var(--border-subtle)",
              opacity: Math.max(0.2, 1 - i * 0.05),
              background: i % 2 === 0 ? "transparent" : "var(--bg-surface-2)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: row.pass ? "var(--ok)" : "var(--danger)",
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span
              style={{ color: "var(--text-muted)", width: 40, flexShrink: 0 }}
            >
              {row.eff}
            </span>
            <span
              style={{
                color: "var(--text-secondary)",
                width: 52,
                flexShrink: 0,
                fontSize: 11,
              }}
            >
              {row.ttype}
            </span>
            <span
              style={{
                color: "var(--text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ₹{row.amt}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontWeight: 700,
                fontSize: 11,
                color: row.pass ? "var(--ok)" : "var(--danger)",
              }}
            >
              {row.pass ? "PASS" : "BLOCK"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeclineMixBar({ declineMix }) {
  if (!declineMix || Object.keys(declineMix).length === 0) return null;
  const total = Object.values(declineMix).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const entries = Object.entries(declineMix).sort((a, b) => b[1] - a[1]);
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        padding: "14px 16px",
      }}
    >
      <SectionTitle>Decline Mix</SectionTitle>
      <div
        style={{
          height: 12,
          display: "flex",
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        {entries.map(([reason, count]) => (
          <div
            key={reason}
            style={{
              width: `${(count / total) * 100}%`,
              background: DECLINE_COLORS[reason] || "#5f6b7c",
            }}
            title={`${reason}: ${count}`}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
        {entries.map(([reason, count]) => (
          <div
            key={reason}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              color: "var(--text-secondary)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: DECLINE_COLORS[reason] || "#5f6b7c",
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span>{reason.replace(/_/g, " ")}</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DryResult({ result }) {
  const [expanded, setExpanded] = useState(null);
  if (!result) return null;
  const stepEntries = Object.entries(result.results ?? {});
  const allOk = result.ok;
  return (
    <div
      style={{
        border: `1px solid ${allOk ? "var(--ok)" : "var(--danger)"}`,
        background: allOk ? "var(--ok-dim)" : "var(--danger-dim)",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          fontSize: 12,
          textTransform: "uppercase",
          color: allOk ? "var(--ok)" : "var(--danger)",
        }}
      >
        {allOk ? "✓ DRY RUN PASSED" : "✗ DRY RUN FAILED"}
        <span
          style={{
            fontWeight: 400,
            color: "var(--text-muted)",
            marginLeft: 12,
          }}
        >
          {result.txn_type?.toUpperCase()}
        </span>
        {result.card_ref && (
          <span
            style={{
              fontWeight: 400,
              color: "var(--text-muted)",
              marginLeft: 12,
            }}
          >
            ref: {result.card_ref}
          </span>
        )}
        {result.payee_vpa && (
          <span
            style={{
              fontWeight: 400,
              color: "var(--text-muted)",
              marginLeft: 12,
            }}
          >
            vpa: {result.payee_vpa}
          </span>
        )}
      </div>
      {result.mcc != null && (
        <div
          style={{
            padding: "0 14px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            fontFamily: "JetBrains Mono, monospace",
            color: "var(--text-secondary)",
          }}
        >
          <span>
            MCC:{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {result.mcc}
            </strong>{" "}
            {MCC_LABELS[result.mcc] ? `(${MCC_LABELS[result.mcc]})` : ""}
          </span>
          {result.is_personal != null && (
            <span
              className={`pill ${result.is_personal ? "pill-warn" : "pill-ok"}`}
            >
              {result.is_personal ? "expect BLOCK" : "expect ALLOW"}
            </span>
          )}
        </div>
      )}
      {stepEntries.map(([step, r]) => (
        <div
          key={step}
          style={{
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "JetBrains Mono, monospace",
            }}
            onClick={() => setExpanded(expanded === step ? null : step)}
          >
            <span
              style={{
                fontWeight: 700,
                color: r.ok ? "var(--ok)" : "var(--danger)",
              }}
            >
              {r.ok ? "✓" : "✗"} {step.toUpperCase()}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              HTTP {r.status || "ERR"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>{r.latency_ms}ms</span>
            <span
              style={{
                marginLeft: "auto",
                color: "var(--text-muted)",
                fontSize: 10,
              }}
            >
              {expanded === step ? "▲" : "▼"}
            </span>
          </div>
          {expanded === step && (
            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div>
                <div className="label">RESPONSE</div>
                <pre
                  style={{
                    background: "var(--bg-surface-2)",
                    border: "1px solid var(--border-subtle)",
                    padding: 8,
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    color: "var(--text-secondary)",
                    overflow: "auto",
                    maxHeight: 112,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    margin: 0,
                  }}
                >
                  {r.body}
                </pre>
              </div>
              <div>
                <div className="label">PAYLOAD SENT</div>
                <pre
                  style={{
                    background: "var(--bg-surface-2)",
                    border: "1px solid var(--border-subtle)",
                    padding: 8,
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    color: "var(--text-secondary)",
                    overflow: "auto",
                    maxHeight: 200,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    margin: 0,
                  }}
                >
                  {JSON.stringify(r.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RunHistoryRow({ run }) {
  const sum = run.summary ?? {};
  const cfg = run.config ?? {};
  const total = sum.total_txns ?? 0;
  const rate = sum.success_rate != null ? sum.success_rate.toFixed(1) : "—";
  const p99 = sum.auth?.all?.p99 ?? sum.confirm?.all?.p99 ?? null;
  const ts = run.started_at
    ? new Date(run.started_at * 1000).toLocaleTimeString()
    : "—";
  const rateNum = parseFloat(rate);

  return (
    <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-muted)",
        }}
      >
        {run.id.slice(0, 8)}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-secondary)",
        }}
      >
        {ts}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
        }}
      >
        {cfg.txn_type ?? "—"}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {total}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          color: rateNum >= 90 ? "var(--ok)" : "var(--danger)",
        }}
      >
        {rate !== "—" ? `${rate}%` : "—"}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {p99 != null ? `${Math.round(p99)}ms` : "—"}
      </td>
      <td
        style={{
          padding: "8px 12px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          color:
            run.status === "done"
              ? "var(--ok)"
              : run.status === "error"
              ? "var(--danger)"
              : "var(--text-muted)",
        }}
      >
        {run.status?.toUpperCase()}
      </td>
      <td style={{ padding: "8px 12px" }}>
        {run.status === "done" && (
          <a
            href={`/api/runs/${run.id}/export?format=csv`}
            style={{
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              color: "var(--info)",
              border: "1px solid var(--border-subtle)",
              padding: "2px 8px",
              textDecoration: "none",
            }}
          >
            CSV
          </a>
        )}
      </td>
    </tr>
  );
}

function ProgressBar({ done, total, isRunning }) {
  if (!isRunning || !total) return null;
  const pct = Math.min(100, (done / total) * 100);
  return (
    <div
      style={{ height: 2, background: "var(--border-subtle)", width: "100%" }}
    >
      <div
        style={{
          height: "100%",
          background: "var(--accent)",
          width: `${pct}%`,
          transition: "width 0.5s ease-out",
        }}
      />
    </div>
  );
}

export default function PineLabsPage() {
  const [authUrl, setAuthUrl] = useState(STAGING_AUTH_URL);
  const [notifUrl, setNotifUrl] = useState(STAGING_NOTIF_URL);
  const [notifUrlManual, setNotifUrlManual] = useState(true);
  const [authHeadersText, setAuthHeadersText] = useState("");
  const [callbackType, setCallbackType] = useState("both");
  const [txnType, setTxnType] = useState("upi");
  const [cardRefsText, setCardRefsText] = useState("");
  const [payeeVpasText, setPayeeVpasText] = useState("");
  const [mcc, setMcc] = useState("6011");
  const [upiTxnType, setUpiTxnType] = useState("P2P");
  const [upiMccMode, setUpiMccMode] = useState("personal");
  const [upiPersonalRatio, setUpiPersonalRatio] = useState(50);
  const [upiMerchantMcc, setUpiMerchantMcc] = useState("");
  const [upiCardNumber, setUpiCardNumber] = useState("");
  const [upiRefNumber, setUpiRefNumber] = useState("");
  const [upiMccDirect, setUpiMccDirect] = useState("");
  const [totalTxns, setTotalTxns] = useState(100);
  const [concurrency, setConcurrency] = useState(10);
  const [amountBase, setAmountBase] = useState(100);
  const [amountVariance, setAmountVariance] = useState(40);
  const [deadlineMs, setDeadlineMs] = useState(3000);
  const [enableSequences, setEnableSequences] = useState(true);

  const [dryRunState, setDryRunState] = useState(null);
  const [dryResult, setDryResult] = useState(null);
  const [runStatus, setRunStatus] = useState("idle");
  const [currentRunId, setCurrentRunId] = useState(null);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [wallHistory, setWallHistory] = useState([]);
  const [runHistory, setRunHistory] = useState([]);
  const prevMetrics = useRef(null);

  useEffect(() => {
    if (!notifUrlManual) setNotifUrl(deriveNotifUrl(authUrl));
  }, [authUrl, notifUrlManual]);

  const { status: wsStatus, lastMessage } = useWebSocket("/ws/metrics");

  useEffect(() => {
    if (!lastMessage) return;
    const { type, data } = lastMessage;
    if (type === "run_started") {
      setCurrentRunId(data.run_id);
      setRunStatus("running");
      setMetrics(null);
      setWallHistory([]);
      setError("");
      prevMetrics.current = null;
    }
    if (type === "metrics") {
      prevMetrics.current = metrics;
      setMetrics(data);
      if (data.wall_clock?.length) setWallHistory(data.wall_clock);
    }
    if (type === "run_complete") {
      setRunStatus("done");
      setStopping(false);
      if (data.summary) setMetrics(data.summary);
      loadHistory();
    }
    if (type === "run_error") {
      setRunStatus("error");
      setError(data.reason ?? "Unknown error");
      setStopping(false);
    }
  }, [lastMessage]);

  const loadHistory = () =>
    fetch("/api/runs")
      .then((r) => r.json())
      .then((rows) => setRunHistory(rows.slice(0, 15)))
      .catch(() => {});

  useEffect(() => {
    loadHistory();
  }, []);

  const buildConfig = () => ({
    auth_url: authUrl,
    notification_url: notifUrl || null,
    auth_headers: parseHeaders(authHeadersText),
    callback_type: callbackType,
    txn_type: txnType,
    card_refs: parseList(cardRefsText),
    payee_vpas: parseList(payeeVpasText),
    mcc,
    upi_txn_type: upiTxnType,
    upi_mcc_mode: upiMccMode,
    upi_personal_ratio: upiPersonalRatio / 100,
    upi_merchant_mcc: upiMerchantMcc,
    upi_card_number: upiCardNumber,
    upi_reference_number: upiRefNumber,
    ...(upiMccDirect
      ? { upi_mcc_mode: "merchant", upi_merchant_mcc: upiMccDirect }
      : {}),
    amount_base: amountBase,
    amount_variance: amountVariance,
    concurrency,
    total_txns: totalTxns,
    deadline_ms: deadlineMs,
    enable_sequences: enableSequences,
  });

  const handleDryRun = async () => {
    if (!authUrl) {
      setError("Enter auth URL");
      return;
    }
    setDryRunState("running");
    setDryResult(null);
    setError("");
    try {
      const r = await fetch("/api/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildConfig()),
      });
      const data = await r.json();
      setDryResult(
        r.ok
          ? data
          : { ok: false, results: {}, error: data.detail ?? "Request failed" }
      );
    } catch (e) {
      setDryResult({ ok: false, results: {}, error: String(e) });
    } finally {
      setDryRunState("done");
    }
  };

  const handleStart = async () => {
    setRunStatus("starting");
    setError("");
    setMetrics(null);
    setWallHistory([]);
    try {
      const r = await fetch("/api/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildConfig()),
      });
      const data = await r.json();
      if (!r.ok) {
        setRunStatus("idle");
        setError(data.detail ?? "Failed to start");
      }
    } catch (e) {
      setRunStatus("idle");
      setError(String(e));
    }
  };

  const handleStop = async () => {
    if (!currentRunId) return;
    setStopping(true);
    try {
      await fetch(`/api/runs/${currentRunId}/stop`, { method: "POST" });
    } catch {}
  };

  const isRunning = runStatus === "running";
  const canStart =
    dryResult?.ok &&
    (runStatus === "idle" || runStatus === "done" || runStatus === "error");
  const showCard = txnType === "card" || txnType === "random";
  const showUpi = txnType === "upi" || txnType === "random";

  const m = metrics ?? {};
  const authSnap = m.auth?.all ?? {};
  const notifSnap = m.confirm?.all ?? {};
  const totalDone = m.total_txns ?? 0;
  const successRate =
    m.success_rate != null ? m.success_rate.toFixed(1) + "%" : "—";
  const matchRate =
    m.outcome_match_rate != null ? m.outcome_match_rate.toFixed(1) + "%" : "—";
  const breachRate =
    m.deadline_breach_rate != null
      ? m.deadline_breach_rate.toFixed(1) + "%"
      : "—";
  const p99Auth = authSnap.p99 != null ? Math.round(authSnap.p99) + "ms" : "—";
  const tps = m.throughput != null ? m.throughput.toFixed(1) : "—";
  const breachIsHigh =
    m.deadline_breach_rate != null && m.deadline_breach_rate > 5;

  // panel style
  const PS = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    padding: 16,
  };
  // nested panel style
  const NPS = {
    background: "var(--bg-surface-2)",
    border: "1px solid var(--border-subtle)",
    padding: 12,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        fontFamily: "'Inter Tight', Inter, sans-serif",
      }}
    >
      <main style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 24 }}
        >
          {/* ── LEFT: Config ──────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Endpoints */}
            <div style={PS}>
              <SectionTitle>Endpoints</SectionTitle>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <Field
                  label="AUTH URL"
                  tip="Volopay's PineLabs authorize callback. Hardcoded to IN staging."
                >
                  <input
                    type="url"
                    value={authUrl}
                    onChange={(e) => setAuthUrl(e.target.value)}
                    className="input"
                    disabled={isRunning}
                  />
                </Field>
                <Field
                  label={`NOTIF URL ${notifUrlManual ? "(manual)" : "(auto)"}`}
                  tip="Auto-derives from auth URL. Edit to override."
                >
                  <input
                    type="url"
                    value={notifUrl}
                    onChange={(e) => {
                      setNotifUrl(e.target.value);
                      setNotifUrlManual(true);
                    }}
                    className="input"
                    disabled={isRunning}
                  />
                  {notifUrlManual && (
                    <button
                      onClick={() => {
                        setNotifUrlManual(false);
                        setNotifUrl(deriveNotifUrl(authUrl));
                      }}
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px 0",
                        fontFamily: "JetBrains Mono, monospace",
                        textDecoration: "underline",
                      }}
                    >
                      reset to auto
                    </button>
                  )}
                </Field>
                <Field
                  label="CALLBACK TYPE"
                  tip="AUTH ONLY / NOTIF ONLY / BOTH (auth then notif if auth passes)"
                >
                  <SegControl
                    value={callbackType}
                    onChange={setCallbackType}
                    disabled={isRunning}
                    options={[
                      { value: "auth_only", label: "AUTH" },
                      { value: "notification_only", label: "NOTIF" },
                      { value: "both", label: "BOTH" },
                    ]}
                  />
                </Field>
                <Field
                  label="AUTH HEADERS"
                  tip="Extra HTTP headers. Format: Header-Name: value, one per line."
                >
                  <textarea
                    rows={2}
                    value={authHeadersText}
                    onChange={(e) => setAuthHeadersText(e.target.value)}
                    placeholder="Authorization: Bearer <token>"
                    className="textarea"
                    disabled={isRunning}
                    spellCheck={false}
                  />
                </Field>
              </div>
            </div>

            {/* TXN Config */}
            <div style={PS}>
              <SectionTitle>Transaction Config</SectionTitle>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <Field label="TXN TYPE" tip="CARD / UPI / MIXED (random)">
                  <SegControl
                    value={txnType}
                    onChange={(v) => {
                      setTxnType(v);
                      setDryResult(null);
                    }}
                    disabled={isRunning}
                    options={[
                      { value: "card", label: "CARD" },
                      { value: "upi", label: "UPI" },
                      { value: "random", label: "MIXED" },
                    ]}
                  />
                </Field>
                {showCard && (
                  <>
                    <Field
                      label="CARD REFERENCE NUMBERS"
                      tip="referenceNumber field in card payload. Rotate multiple."
                    >
                      <textarea
                        rows={3}
                        value={cardRefsText}
                        onChange={(e) => setCardRefsText(e.target.value)}
                        placeholder={"9965777339\n9965777340"}
                        className="textarea"
                        disabled={isRunning}
                        spellCheck={false}
                      />
                      {cardRefsText.trim() && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            marginTop: 4,
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          {parseList(cardRefsText).length} refs — rotating
                        </div>
                      )}
                    </Field>
                    <Field
                      label="MCC CODE"
                      tip="Merchant Category Code for card auth. Tests spend policy."
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          value={mcc}
                          onChange={(e) => setMcc(e.target.value)}
                          placeholder="6011"
                          className="input"
                          style={{ width: 80 }}
                          disabled={isRunning}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          {MCC_LABELS[mcc] ?? "custom"}
                        </span>
                      </div>
                    </Field>
                  </>
                )}
                {showUpi && (
                  <>
                    <Field
                      label="PAYEE VPA LIST"
                      tip="UPI VPA addresses to rotate through."
                    >
                      <textarea
                        rows={3}
                        value={payeeVpasText}
                        onChange={(e) => setPayeeVpasText(e.target.value)}
                        placeholder={"user@okhdfcbank\narjun@axisbank"}
                        className="textarea"
                        disabled={isRunning}
                        spellCheck={false}
                      />
                      {payeeVpasText.trim() && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            marginTop: 4,
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          {parseList(payeeVpasText).length} VPAs — rotating
                        </div>
                      )}
                    </Field>
                    <Field
                      label="UPI TXN TYPE"
                      tip="P2P = person-to-person. P2M = person-to-merchant."
                    >
                      <SegControl
                        value={upiTxnType}
                        onChange={setUpiTxnType}
                        disabled={isRunning}
                        options={[
                          { value: "P2P", label: "P2P" },
                          { value: "P2M", label: "P2M" },
                        ]}
                      />
                    </Field>
                    <Field
                      label="CARD NUMBER (optional)"
                      tip="The card number in Volopay this UPI txn charges. Leave blank to use the default test card."
                    >
                      <input
                        type="text"
                        value={upiCardNumber}
                        onChange={(e) => setUpiCardNumber(e.target.value)}
                        placeholder="6204430026865829 (default)"
                        className="input"
                        disabled={isRunning}
                      />
                    </Field>

                    <Field
                      label="MCC CODE (direct override)"
                      tip="Type a MCC directly. Overrides the block tester below. Leave blank to use block tester mode."
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          value={upiMccDirect}
                          onChange={(e) => setUpiMccDirect(e.target.value)}
                          placeholder="0000 = block · 5411 = grocery · blank = use mode below"
                          className="input"
                          disabled={isRunning}
                        />
                      </div>
                      {upiMccDirect && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--accent)",
                            marginTop: 4,
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          direct MCC: {upiMccDirect}{" "}
                          {MCC_LABELS[upiMccDirect]
                            ? `(${MCC_LABELS[upiMccDirect]})`
                            : ""}{" "}
                          — block tester ignored
                        </div>
                      )}
                    </Field>

                    <Field
                      label="REFERENCE NUMBER (optional)"
                      tip="Normally null for UPI. Only set if testing a specific edge case. UPI txns are identified by null referenceNumber."
                    >
                      <input
                        type="text"
                        value={upiRefNumber}
                        onChange={(e) => setUpiRefNumber(e.target.value)}
                        placeholder="leave blank → null (standard UPI)"
                        className="input"
                        disabled={isRunning}
                      />
                      {upiRefNumber && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--warn)",
                            marginTop: 4,
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          referenceNumber set — non-standard for UPI
                        </div>
                      )}
                    </Field>

                    {/* MCC block tester */}
                    {!upiMccDirect && (
                      <div
                        style={{
                          ...NPS,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: "JetBrains Mono, monospace",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                              color: "var(--text-secondary)",
                            }}
                          >
                            MCC / Block Test
                          </span>
                          <InfoTip text="UPI MCC 0000 = personal transfer — Volopay should block. Non-zero = merchant — should allow. RANDOM MIX tests both." />
                        </div>
                        <Field
                          label="MCC MODE"
                          tip="PERSONAL: all MCC 0000 (block). MERCHANT: merchant MCC (pass). RANDOM: split."
                        >
                          <SegControl
                            value={upiMccMode}
                            onChange={setUpiMccMode}
                            disabled={isRunning}
                            options={[
                              { value: "personal", label: "0000" },
                              { value: "merchant", label: "MERCHANT" },
                              { value: "random", label: "RANDOM" },
                            ]}
                          />
                        </Field>
                        {upiMccMode === "personal" && (
                          <div
                            style={{
                              background: "var(--warn-dim)",
                              border: "1px solid var(--warn)",
                              padding: "6px 10px",
                              fontSize: 11,
                              fontFamily: "JetBrains Mono, monospace",
                              color: "var(--warn)",
                            }}
                          >
                            MCC 0000 → all txns should be{" "}
                            <strong>BLOCKED</strong>
                          </div>
                        )}
                        {upiMccMode === "merchant" && (
                          <>
                            <Field
                              label="MERCHANT MCC (blank = random)"
                              tip="Specific MCC or leave blank for random merchant category."
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <input
                                  type="text"
                                  value={upiMerchantMcc}
                                  onChange={(e) =>
                                    setUpiMerchantMcc(e.target.value)
                                  }
                                  placeholder="5411"
                                  className="input"
                                  style={{ width: 80 }}
                                  disabled={isRunning}
                                />
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "var(--text-muted)",
                                    fontFamily: "JetBrains Mono, monospace",
                                  }}
                                >
                                  {upiMerchantMcc
                                    ? MCC_LABELS[upiMerchantMcc] ?? "custom"
                                    : "random merchant"}
                                </span>
                              </div>
                            </Field>
                            <div
                              style={{
                                background: "var(--ok-dim)",
                                border: "1px solid var(--ok)",
                                padding: "6px 10px",
                                fontSize: 11,
                                fontFamily: "JetBrains Mono, monospace",
                                color: "var(--ok)",
                              }}
                            >
                              Merchant MCC → all txns should{" "}
                              <strong>PASS</strong>
                            </div>
                          </>
                        )}
                        {upiMccMode === "random" && (
                          <>
                            <Field
                              label={`PERSONAL RATIO: ${upiPersonalRatio}% block · ${
                                100 - upiPersonalRatio
                              }% pass`}
                              tip="Fraction of txns using MCC 0000 (should block)."
                            >
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={upiPersonalRatio}
                                onChange={(e) =>
                                  setUpiPersonalRatio(Number(e.target.value))
                                }
                                disabled={isRunning}
                                style={{
                                  width: "100%",
                                  accentColor: "var(--accent)",
                                }}
                              />
                            </Field>
                            <div
                              style={{
                                background: "var(--info-dim)",
                                border: "1px solid var(--info)",
                                padding: "6px 10px",
                                fontSize: 11,
                                fontFamily: "JetBrains Mono, monospace",
                                color: "var(--info)",
                              }}
                            >
                              {upiPersonalRatio}% should block ·{" "}
                              {100 - upiPersonalRatio}% should pass
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Load params */}
            <div style={PS}>
              <SectionTitle>Load Parameters</SectionTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <Field
                  label="TOTAL TXNs"
                  tip="Total transactions to fire. 0 = duration-based."
                >
                  <input
                    type="number"
                    value={totalTxns}
                    onChange={(e) => setTotalTxns(Number(e.target.value))}
                    min={1}
                    max={100000}
                    className="input"
                    disabled={isRunning}
                  />
                </Field>
                <Field label="CONCURRENCY" tip="Parallel workers.">
                  <input
                    type="number"
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    min={1}
                    max={500}
                    className="input"
                    disabled={isRunning}
                  />
                </Field>
                <Field label="AMOUNT BASE (₹)" tip="Base txn amount in rupees.">
                  <input
                    type="number"
                    value={amountBase}
                    onChange={(e) => setAmountBase(Number(e.target.value))}
                    min={1}
                    step={1}
                    className="input"
                    disabled={isRunning}
                  />
                </Field>
                <Field
                  label="VARIANCE (±₹)"
                  tip="Amount = base ± random(variance)."
                >
                  <input
                    type="number"
                    value={amountVariance}
                    onChange={(e) => setAmountVariance(Number(e.target.value))}
                    min={0}
                    step={1}
                    className="input"
                    disabled={isRunning}
                  />
                </Field>
                <Field
                  label="DEADLINE (ms)"
                  tip="P99 threshold for breach rate. Default 3000ms."
                >
                  <input
                    type="number"
                    value={deadlineMs}
                    onChange={(e) => setDeadlineMs(Number(e.target.value))}
                    min={100}
                    step={100}
                    className="input"
                    disabled={isRunning}
                  />
                </Field>
                <Field
                  label="SEQUENCES"
                  tip="Stateful mode: approved debits auto-generate child refund/reversal notifs."
                >
                  <SegControl
                    value={enableSequences ? "on" : "off"}
                    onChange={(v) => setEnableSequences(v === "on")}
                    disabled={isRunning}
                    options={[
                      { value: "on", label: "ON" },
                      { value: "off", label: "OFF" },
                    ]}
                  />
                </Field>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 8,
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                ₹{Math.max(1, amountBase - amountVariance)} – ₹
                {amountBase + amountVariance} per txn
              </div>
            </div>

            {/* Actions */}
            <div style={PS}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleDryRun}
                  disabled={!authUrl || dryRunState === "running" || isRunning}
                  className="btn btn-ghost"
                  style={{
                    flex: 1,
                    opacity:
                      !authUrl || dryRunState === "running" || isRunning
                        ? 0.4
                        : 1,
                  }}
                >
                  {dryRunState === "running" ? "TESTING…" : "DRY TEST"}
                </button>
                {!isRunning && (
                  <button
                    onClick={canStart ? handleStart : undefined}
                    disabled={!canStart || runStatus === "starting"}
                    className={`btn ${canStart ? "btn-primary" : "btn-ghost"}`}
                    style={{
                      flex: 1,
                      opacity: !canStart || runStatus === "starting" ? 0.4 : 1,
                      cursor: canStart ? "pointer" : "not-allowed",
                    }}
                  >
                    {runStatus === "starting" ? "STARTING…" : "START LOAD TEST"}
                  </button>
                )}
                {isRunning && (
                  <button
                    onClick={handleStop}
                    disabled={stopping}
                    className="btn btn-danger"
                    style={{ flex: 1, opacity: stopping ? 0.5 : 1 }}
                  >
                    {stopping ? "STOPPING…" : "STOP"}
                  </button>
                )}
              </div>
              {!dryResult && !isRunning && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    marginTop: 10,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  DRY TEST → validate endpoint → START LOAD TEST
                </div>
              )}
              {error && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--danger)",
                    border: "1px solid var(--danger)",
                    background: "var(--danger-dim)",
                    padding: "8px 12px",
                    marginTop: 10,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* Dry result */}
            {(dryRunState === "running" || dryResult) && (
              <>
                {dryRunState === "running" && (
                  <div
                    style={{
                      ...PS,
                      fontSize: 12,
                      color: "var(--text-muted)",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    FIRING TEST REQUEST…
                  </div>
                )}
                {dryResult && <DryResult result={dryResult} />}
              </>
            )}
          </div>

          {/* ── RIGHT: Metrics ─────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Big stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              <StatNum
                label="COMPLETED"
                value={totalDone || "—"}
                sub={totalTxns > 0 && isRunning ? `of ${totalTxns}` : undefined}
                flash={!!metrics}
              />
              <StatNum label="TPS" value={tps} flash={!!metrics} />
              <StatNum
                label="AUTH P99"
                value={p99Auth}
                flash={!!metrics}
                danger={breachIsHigh}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              <StatNum
                label="SUCCESS RATE"
                value={successRate}
                flash={!!metrics}
              />
              <StatNum
                label="OUTCOME MATCH"
                value={matchRate}
                flash={!!metrics}
              />
              <StatNum
                label="DEADLINE BREACH"
                value={breachRate}
                flash={!!metrics}
                danger={breachIsHigh}
              />
            </div>

            {/* Percentile table */}
            {metrics && (authSnap.p50 != null || notifSnap.p50 != null) && (
              <div style={{ ...PS, position: "relative", overflow: "hidden" }}>
                {isRunning && <div className="scanline-overlay" />}
                <SectionTitle>Latency (ms)</SectionTitle>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 24,
                  }}
                >
                  {[
                    ["AUTH", authSnap],
                    ["NOTIFICATION", notifSnap],
                  ].map(([lbl, snap]) =>
                    snap.p50 != null ? (
                      <div key={lbl}>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontFamily: "JetBrains Mono, monospace",
                            textTransform: "uppercase",
                            marginBottom: 8,
                          }}
                        >
                          {lbl}
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: 12,
                          }}
                        >
                          {[
                            ["P50", snap.p50],
                            ["P90", snap.p90],
                            ["P95", snap.p95],
                            ["P99", snap.p99],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-muted)",
                                  fontFamily: "JetBrains Mono, monospace",
                                }}
                              >
                                {k}
                              </div>
                              <div
                                style={{
                                  fontSize: 18,
                                  fontFamily: "JetBrains Mono, monospace",
                                  fontWeight: 700,
                                  color:
                                    k === "P99" && v > deadlineMs
                                      ? "var(--danger)"
                                      : "var(--text-primary)",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {v != null ? Math.round(v) : "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
                {/* Deadline indicator */}
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 20,
                      height: 1,
                      background: "var(--accent)",
                    }}
                  />
                  <span>deadline: {deadlineMs}ms</span>
                </div>
              </div>
            )}

            {/* Wall clock chart */}
            {wallHistory.length > 0 && (
              <div style={{ ...PS, position: "relative", overflow: "hidden" }}>
                {isRunning && <div className="scanline-overlay" />}
                <SectionTitle>P99 Over Time</SectionTitle>
                <WallClockChart data={wallHistory} />
              </div>
            )}

            {/* Decline mix */}
            {metrics?.decline_mix && (
              <DeclineMixBar declineMix={metrics.decline_mix} />
            )}

            {/* Live ticker */}
            <LiveTicker
              metrics={metrics}
              isRunning={isRunning}
              txnType={txnType}
              amountBase={amountBase}
              amountVariance={amountVariance}
            />

            {/* Empty state */}
            {runStatus === "idle" && !metrics && (
              <div style={{ ...PS, padding: 40, textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                  }}
                >
                  CONFIGURE → DRY TEST → START LOAD TEST
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--border-strong)",
                    marginTop: 8,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  PineLabs IN Staging pre-loaded
                </div>
              </div>
            )}

            {/* Run history */}
            {runHistory.length > 0 && (
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--text-muted)",
                    }}
                  >
                    Recent Runs
                  </span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface-2)" }}>
                      {[
                        "Run",
                        "Time",
                        "Type",
                        "Txns",
                        "Success",
                        "P99",
                        "Status",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "7px 12px",
                            textAlign: "left",
                            fontSize: 11,
                            fontFamily: "JetBrains Mono, monospace",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--text-muted)",
                            borderBottom: "1px solid var(--border-subtle)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runHistory.map((run) => (
                      <RunHistoryRow key={run.id} run={run} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
