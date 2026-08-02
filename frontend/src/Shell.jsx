import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import ExpenseSimulatorPage from "./pages/ExpenseSimulatorPage";
import UsersPanel from "./pages/UsersPanel";
import PineLabsPage from "./pages/PineLabsPage";
import AirwallexPage from "./pages/AirwallexPage";

// Admin tabs. "simulator" replaces the old PineLabs landing; the load-test
// dashboard lives behind "advanced". Client sees only the simulator.
const ADMIN_TABS = [
  { id: "simulator", label: "SIMULATOR" },
  { id: "advanced", label: "LOAD TEST" },
  { id: "airwallex", label: "AIRWALLEX" },
  { id: "users", label: "USERS" },
];

function NavButton({ on, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: 3,
        background: on ? "var(--ok-dim)" : "transparent",
        color: on ? "var(--ok)" : "var(--text-muted)",
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </button>
  );
}

export default function Shell() {
  const { user, logout } = useAuth();
  const isAdmin = user.role === "admin";
  const [page, setPage] = useState("simulator");

  // Client is locked to the simulator — no other page reachable.
  const activePage = isAdmin ? page : "simulator";

  return (
    <div className="app" style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span
            style={{
              fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.08em", color: "var(--accent)",
            }}
          >
            TOOLGATE
          </span>
          {isAdmin &&
            ADMIN_TABS.map((t) => (
              <NavButton key={t.id} on={page === t.id} onClick={() => setPage(t.id)}>
                {t.label}
              </NavButton>
            ))}
          {!isAdmin && (
            <span style={{
              fontSize: 11, fontFamily: "JetBrains Mono, monospace",
              color: "var(--text-muted)", letterSpacing: "0.08em",
            }}>
              EXPENSE SIMULATOR
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
          <span style={{ color: "var(--text-secondary)" }}>
            {user.username}
            <span style={{
              marginLeft: 8,
              color: isAdmin ? "var(--accent)" : "var(--info)",
              fontWeight: 700,
            }}>
              {user.role}
            </span>
          </span>
          <button
            onClick={logout}
            className="btn"
            style={{ border: "1px solid var(--border-strong)", color: "var(--text-muted)", padding: "4px 10px" }}
          >
            LOGOUT
          </button>
        </div>
      </header>

      {activePage === "simulator" && <ExpenseSimulatorPage showEndpointFields={isAdmin} />}
      {isAdmin && activePage === "advanced" && <PineLabsPage />}
      {isAdmin && activePage === "airwallex" && <AirwallexPage />}
      {isAdmin && activePage === "users" && <UsersPanel />}
    </div>
  );
}
