export function StatBlocks({ metrics }) {
  const auth = metrics?.auth?.all
  const confirm = metrics?.confirm?.all

  function fmt(v, unit = '') {
    if (v === undefined || v === null) return '—'
    return `${Number(v).toLocaleString('en', { maximumFractionDigits: 1 })}${unit}`
  }

  const top = [
    { label: 'TOTAL TXN', value: fmt(metrics?.total_txns), big: true },
    { label: 'REQ / S', value: fmt(metrics?.throughput) },
    { label: 'ELAPSED', value: fmt(metrics?.elapsed, 's') },
    { label: 'SUCCESS %', value: fmt(metrics?.success_rate, '%') },
    { label: 'MATCHED %', value: fmt(metrics?.outcome_match_rate, '%') },
  ]
  const authRow = [
    { label: 'AUTH P50', value: fmt(auth?.p50, 'ms') },
    { label: 'AUTH P95', value: fmt(auth?.p95, 'ms') },
    { label: 'AUTH P99', value: fmt(auth?.p99, 'ms') },
    { label: 'AUTH MAX', value: fmt(auth?.max, 'ms') },
  ]
  const confRow = [
    { label: 'CONF P50', value: fmt(confirm?.p50, 'ms') },
    { label: 'CONF P95', value: fmt(confirm?.p95, 'ms') },
    { label: 'CONF P99', value: fmt(confirm?.p99, 'ms') },
    { label: 'CONF MAX', value: fmt(confirm?.max, 'ms') },
  ]

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 border border-neutral-200 divide-x divide-neutral-200 bg-white">
        {top.map(({ label, value, big }) => (
          <div key={label} className="p-4">
            <div className="stat-label mb-2">{label}</div>
            <div className={big ? 'stat-value-lg' : 'stat-value'}>{value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 border border-neutral-200 divide-x divide-neutral-200 bg-neutral-50">
        {authRow.map(({ label, value }) => (
          <div key={label} className="p-3">
            <div className="stat-label mb-1">{label}</div>
            <div className="text-2xl font-bold tabular-nums text-neutral-900">{value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 border border-neutral-200 divide-x divide-neutral-200 bg-neutral-50">
        {confRow.map(({ label, value }) => (
          <div key={label} className="p-3">
            <div className="stat-label mb-1">{label}</div>
            <div className="text-2xl font-bold tabular-nums text-neutral-900">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
