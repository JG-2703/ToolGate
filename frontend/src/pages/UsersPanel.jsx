import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";

export default function UsersPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("client");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/users", { credentials: "include" });
    if (r.ok) setUsers(await r.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create user");
      }
      setUsername(""); setPassword(""); setRole("client");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" });
    await load();
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 64px" }}>
      <h1
        style={{
          fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--text-primary)", marginBottom: 20,
        }}
      >
        User management
      </h1>

      {/* create user */}
      <form onSubmit={create} className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        <div className="label">CREATE USER</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr auto", gap: 10, alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">USERNAME</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} spellCheck={false} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">PASSWORD</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">ROLE</span>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}
              style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
              <option value="client">client</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !username || !password}
            style={{ opacity: busy || !username || !password ? 0.5 : 1 }}>
            ADD
          </button>
        </div>
        {error && (
          <div style={{ fontSize: 11, color: "var(--danger)", fontFamily: "JetBrains Mono, monospace" }}>
            {error}
          </div>
        )}
      </form>

      {/* user list */}
      <div className="panel" style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
              <th style={th}>USERNAME</th>
              <th style={th}>ROLE</th>
              <th style={{ ...th, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={td}>{u.username}</td>
                <td style={td}>
                  <span style={{
                    color: u.role === "admin" ? "var(--accent)" : "var(--info)",
                    fontWeight: 700, fontSize: 11,
                  }}>{u.role}</span>
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  {u.id !== user.id && (
                    <button onClick={() => remove(u.id)} className="btn"
                      style={{ color: "var(--danger)", border: "1px solid var(--border-strong)", padding: "4px 10px" }}>
                      DELETE
                    </button>
                  )}
                  {u.id === user.id && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>you</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "10px 14px", fontSize: 10, letterSpacing: "0.08em", fontWeight: 700 };
const td = { padding: "10px 14px", color: "var(--text-secondary)" };
