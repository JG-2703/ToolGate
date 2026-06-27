import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'

export function RampChart({ steps }) {
  if (!steps?.length) {
    return (
      <div className="panel">
        <div className="panel-title">RAMP — P99 PER CONCURRENCY STEP</div>
        <div className="h-40 flex items-center justify-center text-neutral-300 text-xs">
          NO RAMP DATA — ENABLE RAMP MODE
        </div>
      </div>
    )
  }
  const maxP99 = Math.max(...steps.map((s) => s.p99))
  return (
    <div className="panel">
      <div className="panel-title">RAMP — AUTH P99 PER CONCURRENCY STEP (ms)</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {steps.map((s) => (
          <div key={s.concurrency} className="bg-neutral-50 border border-neutral-200 p-3">
            <div className="stat-label mb-1">CONC {s.concurrency}</div>
            <div className="text-2xl font-bold tabular-nums text-neutral-900">{s.p99}ms</div>
            <div className="text-xs text-neutral-400 mt-1">{s.txns} txn · {s.throughput}/s</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={steps} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e8e8e8" vertical={false} />
          <XAxis dataKey="concurrency" tickFormatter={(v) => `c=${v}`}
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
          <YAxis tickFormatter={(v) => `${v}ms`}
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', fontSize: 11, fontFamily: 'monospace', color: '#111' }}
            formatter={(v) => [`${v}ms`, 'P99']}
            labelFormatter={(v) => `concurrency=${v}`}
          />
          <Bar dataKey="p99" name="P99">
            {steps.map((s) => (
              <Cell key={s.concurrency} fill={s.p99 === maxP99 ? '#111' : '#d0d0d0'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
