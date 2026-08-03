# ToolGate — Deploy & Configuration Guide

How to configure and run ToolGate (auth + RBAC + PineLabs expense simulator),
locally and on Render, plus how to log every request.

---

## 1. Configuration (environment variables)

All config is via env vars. Nothing sensitive is committed.

### Required in production
| Var | Purpose | Notes |
|---|---|---|
| `TOOLGATE_ENV` | `prod` turns on all hardening | Secure cookie, docs off, strict guards. Omit / `dev` for local. |
| `TOOLGATE_JWT_SECRET` | Signs session JWTs | **Server refuses to boot in prod without it.** Use a random 32+ char string. |
| `TOOLGATE_ADMIN_USER` | First admin username | Default `admin`. |
| `TOOLGATE_ADMIN_PASSWORD` | First admin password | **Prod refuses weak/short (<12 char) passwords.** Seeded only on first boot (empty users table). |

### Required for the expense simulator (client mode)
Client users never see or enter callback URLs — they come from here:
| Var | Purpose |
|---|---|
| `TOOLGATE_PINELABS_AUTH_URL` | Auth callback URL fired by scenarios |
| `TOOLGATE_PINELABS_NOTIF_URL` | Notification callback URL (settle/refund) |
| `TOOLGATE_ALLOWED_HOSTS` | SSRF allowlist, comma-separated host suffixes. Default `volopay.site,volopay.co`. **Must include your target host** or requests are rejected with 400. |

### Optional / tuning
| Var | Default | Purpose |
|---|---|---|
| `TOOLGATE_DB_PATH` | `/data/toolgate.db` | SQLite file location |
| `TOOLGATE_JWT_TTL` | `43200` (12h) | Session lifetime, seconds |
| `TOOLGATE_LOGIN_MAX_ATTEMPTS` | `10` | Login attempts before 429 |
| `TOOLGATE_LOGIN_WINDOW_SEC` | `300` | Rate-limit window, seconds |

### Generate a strong JWT secret
```bash
python -c "import secrets; print(secrets.token_hex(32))"
# or
openssl rand -hex 32
```

---

## 2. Migration

**No manual migration.** `init_db()` runs on startup and creates the `users`
table (and `runs`/`samples` if missing) with `CREATE TABLE IF NOT EXISTS`.
Existing data is untouched. The admin user is seeded only when the `users` table
is empty.

Upgrading an existing deploy: just deploy the new image — the `users` table is
added automatically on first boot, admin is seeded from env.

---

## 3. Run locally

### Dev (two servers, hot reload)
```bash
# backend
cd backend
TOOLGATE_DB_PATH=./toolgate.db \
TOOLGATE_ADMIN_USER=admin TOOLGATE_ADMIN_PASSWORD=admin123 \
TOOLGATE_JWT_SECRET=devsecret \
TOOLGATE_PINELABS_AUTH_URL="https://main.apis.volopay.site/api/v1/callbacks/pinelabs-authorize" \
TOOLGATE_PINELABS_NOTIF_URL="https://main.apis.volopay.site/api/v1/callbacks/pinelabs-txn-notifications" \
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# frontend (separate terminal) — proxies /api + /ws to :8000
cd frontend && npm run dev      # http://localhost:5173
```

### Single local server (production-style)
```bash
cd frontend && npx vite build && rm -rf ../backend/static && cp -r dist ../backend/static
cd ../backend
TOOLGATE_DB_PATH=./toolgate.db \
TOOLGATE_ADMIN_USER=admin TOOLGATE_ADMIN_PASSWORD=admin123 \
TOOLGATE_JWT_SECRET=local-stable-secret \
TOOLGATE_PINELABS_AUTH_URL="https://main.apis.volopay.site/api/v1/callbacks/pinelabs-authorize" \
TOOLGATE_PINELABS_NOTIF_URL="https://main.apis.volopay.site/api/v1/callbacks/pinelabs-txn-notifications" \
uvicorn main:app --host 127.0.0.1 --port 8000
# open http://localhost:8000   (UI + API on one port)
```
> After any frontend change, rebuild + recopy `dist` → `backend/static`.

### Docker
```bash
docker compose up --build     # http://localhost:8000
```

---

## 4. Deploy on Render

The repo has a `Dockerfile` (builds the React app into the backend's `static/`)
and honours `$PORT`. Nothing in the Dockerfile needs changing.

### Steps
1. **render.com → New + → Web Service**, connect `JG-2703/ToolGate`, branch `main`.
2. Runtime auto-detects **Docker**.
3. **Add Disk** (Advanced): name `data`, mount path `/data`, 1 GB. Without this,
   SQLite (users + run history) is wiped on every redeploy.
4. **Environment variables** — set these:
   ```
   TOOLGATE_ENV=prod
   TOOLGATE_JWT_SECRET=<random 32+ char>
   TOOLGATE_ADMIN_USER=admin
   TOOLGATE_ADMIN_PASSWORD=<strong, 12+ chars>
   TOOLGATE_DB_PATH=/data/toolgate.db
   TOOLGATE_PINELABS_AUTH_URL=https://main.apis.volopay.site/api/v1/callbacks/pinelabs-authorize
   TOOLGATE_PINELABS_NOTIF_URL=https://main.apis.volopay.site/api/v1/callbacks/pinelabs-txn-notifications
   TOOLGATE_ALLOWED_HOSTS=volopay.site,volopay.co
   ```
5. **Create Web Service** → build ~3-4 min → open `https://<app>.onrender.com`.
6. Log in with the admin creds. Add client users via the **USERS** tab.

### Render constraints
- **HTTPS is automatic** on Render → the Secure cookie works. (`TOOLGATE_ENV=prod`
  sets `Secure`; over plain HTTP the browser would drop the cookie — Render is
  HTTPS so you're fine.)
- **Keep one instance** (min = max = 1). The run-lock, in-memory rate-limit
  counters, and WebSocket set are per-process — do not scale to multiple replicas.
- **Network reach:** Render is public cloud. It must be able to reach
  `main.apis.volopay.site`. If that host is VPN/internal-only, Render can't hit
  it — deploy on an internal VM instead (see README).
- ⚠️ If you set `TOOLGATE_ENV=prod` but forget `TOOLGATE_JWT_SECRET`, the
  container **won't start** (by design). Set both together.

---

## 5. Logging every request on Render

Render captures **stdout/stderr** automatically — view under the service's
**Logs** tab (live tail) or stream via `render logs` CLI.

### What you get out of the box
uvicorn prints an **access log line per request** to stdout, e.g.:
```
INFO:  127.0.0.1:52341 - "POST /api/pinelabs/scenario HTTP/1.1" 200
```
This shows method, path, and status for every request — already flowing to
Render Logs. No change needed for basic request logging.

### Fuller request logging (method, path, status, latency, user)
The default access log omits latency and the authenticated user. Add a small
middleware to `backend/main.py` (after `app = FastAPI(...)`):

```python
import logging, time
logging.basicConfig(level=logging.INFO)
req_log = logging.getLogger("toolgate.request")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.monotonic()
    response = await call_next(request)
    dur_ms = round((time.monotonic() - t0) * 1000, 1)
    req_log.info(
        "%s %s -> %s %sms ip=%s",
        request.method, request.url.path, response.status_code,
        dur_ms, request.client.host if request.client else "-",
    )
    return response
```
This logs one structured line per request to stdout → Render Logs.

> ⚠️ Do NOT log request bodies for auth/scenario endpoints — they contain
> passwords and (in admin mode) callback tokens. Log method/path/status/latency
> only.

### Outbound call logging (the callbacks ToolGate fires)
To see the PineLabs callbacks the simulator sends, add a log line in
`backend/scenario.py` inside `_fire()` (already returns status + latency):
```python
import logging
logging.getLogger("toolgate.outbound").info(
    "%s %s -> %s %sms", step, url, r.status_code, latency
)
```

### Persisting / shipping logs beyond Render's retention
Render's free tier keeps logs briefly. For durable logs:
- **Render Log Streams** (paid) → forward to Datadog / Logtail / Papertrail.
- Or add a file handler writing to the mounted `/data` disk (survives restarts):
  ```python
  logging.getLogger().addHandler(logging.FileHandler("/data/requests.log"))
  ```

---

## 6. Quick post-deploy verification
```bash
BASE=https://<app>.onrender.com
# UI loads
curl -s -o /dev/null -w "%{http_code}\n" $BASE/
# docs disabled in prod
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/docs      # expect 404
# login
curl -s -i -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your pw>"}' | grep -i set-cookie   # expect Secure; SameSite=strict; HttpOnly
```
