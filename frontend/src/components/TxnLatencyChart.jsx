import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

function Chart({ title, data }) {
  if (!data?.length) {
    return (
      <div className="panel flex-1">
        <div className="panel-title">{title}</div>
        <div className="h-40 flex items-center justify-center text-neutral-300 text-xs">
          AVAILABLE AFTER RUN COMPLETES
        </div>
      </div>
    )
  }
  return (
    <div className="panel flex-1">
      <div className="panel-title">{title} — P50 / P95 / P99 (ms)</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e8e8e8" />
          <XAxis dataKey="txn" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
            stroke="#ddd" label={{ value: 'TXN', fill: '#aaa', fontSize: 9, position: 'insideRight' }} />
          <YAxis tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', fontSize: 11, fontFamily: 'monospace', color: '#111' }}
            formatter={(v) => [`${v}ms`]}
            labelFormatter={(v) => `txn #${v}`}
          />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', color: '#555' }} />
          <Line type="monotone" dataKey="p50" name="P50" stroke="#bbb" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="p95" name="P95" stroke="#666" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="p99" name="P99" stroke="#111" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TxnLatencyCharts({ txnSeries }) {
  return (
    <div className="flex gap-3">
      <Chart title="AUTH — TXN VS LATENCY" data={txnSeries?.auth} />
      <Chart title="CONFIRMATION — TXN VS LATENCY" data={txnSeries?.confirm} />
    </div>
  )
}
