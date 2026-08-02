import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
      }}
    >
      <form
        onSubmit={submit}
        className="panel"
        style={{
          width: 360,
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.12em",
              color: "var(--accent)",
            }}
          >
            TOOLGATE
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "JetBrains Mono, monospace",
              marginTop: 6,
              letterSpacing: "0.08em",
            }}
          >
            SIGN IN TO CONTINUE
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">USERNAME</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            spellCheck={false}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">PASSWORD</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div
            style={{
              fontSize: 11,
              color: "var(--danger)",
              fontFamily: "JetBrains Mono, monospace",
              background: "var(--danger-dim)",
              border: "1px solid var(--danger)",
              padding: "8px 10px",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !username || !password}
          style={{ opacity: busy || !username || !password ? 0.5 : 1 }}
        >
          {busy ? "SIGNING IN…" : "SIGN IN"}
        </button>
      </form>
    </div>
  );
}
