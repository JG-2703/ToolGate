import { useEffect, useRef, useState } from "react";
import PineLabsPage from "./pages/PineLabsPage";
import AirwallexPage from "./pages/AirwallexPage";
import { useWebSocket } from "./hooks/useWebSocket";
import { WallClockChart } from "./components/WallClockChart";

const AUTH_URL_PLACEHOLDER =
  "https://<host>/api/v1/callbacks/pinelabs-authorize";
const NOTIF_URL_PLACEHOLDER =
  "https://<host>/api/v1/callbacks/pinelabs-txn-notifications";

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

export default function App() {
  const [page, setPage] = useState("pinelabs");
  const [authUrl, setAuthUrl] = useState("");
  const [notifUrl, setNotifUrl] = useState("");
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
    <div className="app">
      {/* ── Status bar ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "0 24px",
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.08em",
              color: "var(--accent)",
            }}
          >
            TOOLGATE
          </span>

          <button
            onClick={() => setPage("pinelabs")}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: 3,
              background: page === "pinelabs" ? "var(--ok-dim)" : "transparent",
              color: page === "pinelabs" ? "var(--ok)" : "var(--text-muted)",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            PINELABS
          </button>

          <button
            onClick={() => setPage("airwallex")}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: 3,
              background:
                page === "airwallex" ? "var(--ok-dim)" : "transparent",
              color: page === "airwallex" ? "var(--ok)" : "var(--text-muted)",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            AIRWALLEX
          </button>

          <span
            style={{
              padding: "2px 8px",
              background: "var(--ok-dim)",
              color: "var(--ok)",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 700,
              borderRadius: 3,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            STAGING
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
          }}
        >
          {tps !== "—" && (
            <span
              style={{
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                TPS{" "}
              </span>
              {tps}
            </span>
          )}
          {p99Auth !== "—" && (
            <span
              style={{
                color: breachIsHigh ? "var(--danger)" : "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                P99{" "}
              </span>
              {p99Auth}
              {breachIsHigh && (
                <span
                  style={{
                    color: "var(--danger)",
                    marginLeft: 4,
                    fontSize: 10,
                  }}
                >
                  ▲ BREACH
                </span>
              )}
            </span>
          )}
          <span
            style={{
              color:
                wsStatus === "connected" ? "var(--ok)" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {wsStatus === "connected" ? (
              <span className="running-dot" style={{ color: "var(--ok)" }} />
            ) : (
              "○"
            )}
            <span style={{ fontSize: 11, letterSpacing: "0.08em" }}>
              {wsStatus === "connected" ? "LIVE" : wsStatus.toUpperCase()}
            </span>
          </span>
          {isRunning && (
            <span
              style={{
                border: "1px solid var(--accent)",
                padding: "2px 10px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--accent)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              <span
                className="running-dot"
                style={{ color: "var(--accent)" }}
              />{" "}
              RUNNING
            </span>
          )}
          {runStatus === "done" && (
            <span
              style={{
                border: "1px solid var(--border-strong)",
                color: "var(--text-muted)",
                padding: "2px 10px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              DONE
            </span>
          )}
          {runStatus === "error" && (
            <span
              style={{
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                padding: "2px 10px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              ERROR
            </span>
          )}
        </div>
      </header>

      <ProgressBar done={totalDone} total={totalTxns} isRunning={isRunning} />
      {page === "pinelabs" ? <PineLabsPage /> : <AirwallexPage />}
    </div>
  );
}
