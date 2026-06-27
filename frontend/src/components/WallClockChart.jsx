import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

const LINES = [
  { key: 'auth_p50',    name: 'AUTH P50',  stroke: '#999', width: 1 },
  { key: 'auth_p95',   name: 'AUTH P95',  stroke: '#555', width: 1 },
  { key: 'auth_p99',   name: 'AUTH P99',  stroke: '#111', width: 2 },
  { key: 'confirm_p50',   name: 'CONF P50',  stroke: '#bbb', width: 1 },
  { key: 'confirm_p95',   name: 'CONF P95',  stroke: '#6699cc', width: 1 },
  { key: 'confirm_p99',   name: 'CONF P99',  stroke: '#2255aa', width: 2 },
]

export function WallClockChart({ data }) {
  if (!data?.length) {
    return (
      <div className="panel">
        <div className="panel-title">LATENCY OVER WALL CLOCK</div>
        <div className="h-48 flex items-center justify-center text-neutral-300 text-xs">NO DATA</div>
      </div>
    )
  }
  return (
    <div className="panel">
      <div className="panel-title">LATENCY OVER WALL CLOCK (ms)</div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e8e8e8" />
          <XAxis dataKey="t" tickFormatter={(v) => `${v}s`}
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
          <YAxis tickFormatter={(v) => `${v}`}
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', fontSize: 11, fontFamily: 'monospace', color: '#111' }}
            formatter={(v, name) => [`${v}ms`, name]}
            labelFormatter={(v) => `t=${v}s`}
          />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', color: '#555' }} />
          {LINES.map(({ key, name, stroke, width }) => (
            <Line key={key} type="monotone" dataKey={key} name={name}
              stroke={stroke} dot={false} strokeWidth={width} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
