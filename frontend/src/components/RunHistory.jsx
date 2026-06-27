import { useState, useEffect } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

function mergeCompare(runA, runB) {
  const wclkA = runA?.summary?.wall_clock ?? []
  const wclkB = runB?.summary?.wall_clock ?? []
  const map = {}
  for (const p of wclkA) map[p.t] = { t: p.t, a_p99: p.auth_p99 }
  for (const p of wclkB) {
    if (map[p.t]) map[p.t].b_p99 = p.auth_p99
    else map[p.t] = { t: p.t, b_p99: p.auth_p99 }
  }
  return Object.values(map).sort((a, b) => a.t - b.t)
}

function Badge({ status }) {
  const styles = {
    done: 'bg-neutral-900 text-white',
    running: 'bg-white text-neutral-900 border border-neutral-900',
    error: 'bg-red-50 text-red-600 border border-red-200',
    cancelled: 'bg-neutral-100 text-neutral-400',
  }
  return (
    <span className={`text-xs font-mono uppercase px-2 py-0.5 ${styles[status] ?? 'bg-neutral-100 text-neutral-400'}`}>
      {status}
    </span>
  )
}

export function RunHistory() {
  const [runs, setRuns] = useState([])
  const [compareIds, setCompareIds] = useState([null, null])
  const [compareData, setCompareData] = useState([])
  const [loadingCmp, setLoadingCmp] = useState(false)

  const fetchRuns = async () => {
    try { setRuns(await fetch('/api/runs').then((r) => r.json())) } catch {}
  }

  useEffect(() => {
    fetchRuns()
    const t = setInterval(fetchRuns, 5000)
    return () => clearInterval(t)
  }, [])

  const handleCompare = async () => {
    const [idA, idB] = compareIds
    if (!idA || !idB) return
    setLoadingCmp(true)
    try {
      const [rA, rB] = await Promise.all([
        fetch(`/api/runs/${idA}`).then((r) => r.json()),
        fetch(`/api/runs/${idB}`).then((r) => r.json()),
      ])
      setCompareData(mergeCompare(rA, rB))
    } finally { setLoadingCmp(false) }
  }

  const toggle = (id, slot) => {
    setCompareIds((prev) => { const n = [...prev]; n[slot] = n[slot] === id ? null : id; return n })
    setCompareData([])
  }

  return (
    <div className="panel">
      <div className="panel-title">RUN HISTORY</div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-neutral-400 border-b border-neutral-200">
            {['ID','PROFILE','STARTED','DUR','STATUS','TXN','P99','CMP A','CMP B','EXPORT'].map((h) => (
              <th key={h} className="text-left pb-2 pr-3 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const dur = r.ended_at ? `${Math.round(r.ended_at - r.started_at)}s` : '—'
            const p99 = r.summary?.auth?.all?.p99
            return (
              <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2 pr-3 text-neutral-400">{r.id.slice(0, 8)}</td>
                <td className="py-2 pr-3 text-neutral-700">{r.profile_id}</td>
                <td className="py-2 pr-3 text-neutral-500">
                  {new Date(r.started_at * 1000).toLocaleTimeString()}
                </td>
                <td className="py-2 pr-3 tabular-nums">{dur}</td>
                <td className="py-2 pr-3"><Badge status={r.status} /></td>
                <td className="py-2 pr-3 tabular-nums">{r.summary?.total_txns ?? '—'}</td>
                <td className="py-2 pr-3 tabular-nums">{p99 != null ? `${p99}ms` : '—'}</td>
                <td className="py-2 pr-3">
                  <button onClick={() => toggle(r.id, 0)}
                    className={`text-xs px-2 py-0.5 border font-mono ${compareIds[0] === r.id ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-300 text-neutral-400 hover:border-neutral-700'}`}>
                    A
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <button onClick={() => toggle(r.id, 1)}
                    className={`text-xs px-2 py-0.5 border font-mono ${compareIds[1] === r.id ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-300 text-neutral-400 hover:border-neutral-700'}`}>
                    B
                  </button>
                </td>
                <td className="py-2">
                  <button onClick={() => { window.location.href = `/api/runs/${r.id}/export?format=json` }}
                    className="text-xs text-neutral-400 hover:text-neutral-900 mr-2">JSON</button>
                  <button onClick={() => { window.location.href = `/api/runs/${r.id}/export?format=csv` }}
                    className="text-xs text-neutral-400 hover:text-neutral-900">CSV</button>
                </td>
              </tr>
            )
          })}
          {!runs.length && (
            <tr><td colSpan={10} className="py-6 text-center text-neutral-300">NO RUNS YET</td></tr>
          )}
        </tbody>
      </table>

      {compareIds[0] && compareIds[1] && (
        <div className="mt-4 pt-4 border-t border-neutral-200">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-xs text-neutral-500">
              A={compareIds[0].slice(0,8)} · B={compareIds[1].slice(0,8)}
            </span>
            <button onClick={handleCompare} disabled={loadingCmp} className="btn-primary">
              {loadingCmp ? 'LOADING…' : 'COMPARE P99'}
            </button>
            <button onClick={() => { setCompareIds([null,null]); setCompareData([]) }} className="btn-ghost">
              CLEAR
            </button>
          </div>
          {compareData.length > 0 && (
            <>
              <div className="stat-label mb-2">AUTH P99 OVERLAY (ms)</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={compareData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#e8e8e8" />
                  <XAxis dataKey="t" tickFormatter={(v) => `${v}s`}
                    tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
                  <YAxis tickFormatter={(v) => `${v}ms`}
                    tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} stroke="#ddd" />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', fontSize: 11, fontFamily: 'monospace', color: '#111' }}
                    formatter={(v) => [`${v}ms`]} labelFormatter={(v) => `t=${v}s`}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', color: '#555' }} />
                  <Line type="monotone" dataKey="a_p99" name={`RUN A (${compareIds[0].slice(0,8)})`}
                    stroke="#111" dot={false} strokeWidth={2} connectNulls />
                  <Line type="monotone" dataKey="b_p99" name={`RUN B (${compareIds[1].slice(0,8)})`}
                    stroke="#2255aa" dot={false} strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}
    </div>
  )
}
