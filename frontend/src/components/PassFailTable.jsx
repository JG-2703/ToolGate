function Row({ label, data, shade }) {
  function v(x) {
    if (x === undefined || x === null) return '—'
    return typeof x === 'number' ? x.toFixed(1) : x
  }
  return (
    <tr className={`border-t border-neutral-100 ${shade ? 'bg-neutral-50' : 'bg-white'}`}>
      <td className="py-2 pr-4 text-neutral-500 font-medium">{label}</td>
      <td className="py-2 pr-4 tabular-nums">{v(data?.p50)}</td>
      <td className="py-2 pr-4 tabular-nums">{v(data?.p95)}</td>
      <td className="py-2 pr-4 tabular-nums">{v(data?.p99)}</td>
      <td className="py-2 pr-4 tabular-nums">{v(data?.mean)}</td>
      <td className="py-2 pr-4 tabular-nums">{v(data?.success_rate)}%</td>
      <td className="py-2 tabular-nums">{v(data?.outcome_match_rate)}%</td>
    </tr>
  )
}

export function PassFailTable({ metrics }) {
  const a = metrics?.auth
  const c = metrics?.confirm
  return (
    <div className="panel">
      <div className="panel-title">PASS / FAIL SPLIT — ALL METRICS (ms)</div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-neutral-400 border-b border-neutral-200">
            <th className="text-left pb-2 pr-4">PATH</th>
            <th className="text-left pb-2 pr-4">P50</th>
            <th className="text-left pb-2 pr-4">P95</th>
            <th className="text-left pb-2 pr-4">P99</th>
            <th className="text-left pb-2 pr-4">MEAN</th>
            <th className="text-left pb-2 pr-4">SUCCESS%</th>
            <th className="text-left pb-2">MATCHED%</th>
          </tr>
        </thead>
        <tbody>
          <Row label="AUTH · ALL"  data={a?.all}  shade={false} />
          <Row label="AUTH · PASS" data={a?.pass} shade={true}  />
          <Row label="AUTH · FAIL" data={a?.fail} shade={false} />
          <Row label="CONF · ALL"  data={c?.all}  shade={true}  />
          <Row label="CONF · PASS" data={c?.pass} shade={false} />
          <Row label="CONF · FAIL" data={c?.fail} shade={true}  />
        </tbody>
      </table>
    </div>
  )
}
