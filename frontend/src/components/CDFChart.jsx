import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

function merge(authCdf, confirmCdf) {
  const map = {}
  for (const p of authCdf ?? []) map[p.pct] = { pct: p.pct, auth: p.latency_ms }
  for (const p of confirmCdf ?? []) {
    if (map[p.pct]) map[p.pct].confirm = p.latency_ms
    else map[p.pct] = { pct: p.pct, confirm: p.latency_ms }
  }
  return Object.values(map).sort((a, b) => a.pct - b.pct)
}

export function CDFChart({ cdf }) {
  const data = merge(cdf?.auth, cdf?.confirm)
  if (!data.length) {
    return (
      <div className="panel">
        <div className="panel-title">CDF — LATENCY DISTRIBUTION</div>
        <div className="h-48 flex items-center justify-center text-neutral-300 text-xs">NO DATA</div>
      </div>
    )
  }
  return (
    <div className="panel">
      <div className="panel-title">CDF — LATENCY DISTRIBUTION (ms)</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e8e8e8" />
          <XAxis dataKey="pct" tickFormatter={(v) => `${v}%`}
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
          <YAxis tickFormatter={(v) => `${v}ms`}
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', fontSize: 11, fontFamily: 'monospace', color: '#111' }}
            formatter={(v) => [`${v}ms`]}
            labelFormatter={(v) => `p${v}`}
          />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', color: '#555' }} />
          <Line type="monotone" dataKey="auth" name="AUTH" stroke="#111" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="confirm" name="CONFIRM" stroke="#2255aa" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
