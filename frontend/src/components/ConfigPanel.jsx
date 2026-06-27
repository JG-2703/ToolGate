import { useEffect, useState } from 'react'

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="stat-label mb-1">{label}</div>
      {hint && <div className="text-xs text-neutral-400 mb-1">{hint}</div>}
      {children}
    </div>
  )
}

function NumInput({ value, onChange, min, max, step, disabled }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step ?? 1}
      disabled={disabled}
      className="input"
    />
  )
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`w-8 h-4 relative flex items-center transition-colors border ${
          checked ? 'bg-neutral-900 border-neutral-900' : 'bg-white border-neutral-400'
        }`}
      >
        <div
          className={`w-3 h-3 bg-white border border-neutral-400 absolute transition-transform ${
            checked ? 'translate-x-4 border-neutral-900' : 'translate-x-0.5'
          }`}
        />
      </div>
      <span className="stat-label">{label}</span>
    </label>
  )
}

function PayloadEditor({ profileTemplate, onChange, disabled }) {
  const defaultJson = profileTemplate ? JSON.stringify(profileTemplate, null, 2) : '{}'
  const [mode, setMode] = useState('fields') // 'fields' | 'json'
  const [jsonText, setJsonText] = useState(defaultJson)
  const [parsed, setParsed] = useState(profileTemplate ?? {})
  const [parseError, setParseError] = useState('')

  useEffect(() => {
    const next = profileTemplate ? JSON.stringify(profileTemplate, null, 2) : '{}'
    setJsonText(next)
    setParsed(profileTemplate ?? {})
    setParseError('')
    onChange(null) // reset override when profile changes
  }, [JSON.stringify(profileTemplate)])

  const handleJsonChange = (text) => {
    setJsonText(text)
    try {
      const obj = JSON.parse(text)
      setParsed(obj)
      setParseError('')
      onChange(text)
    } catch (e) {
      setParseError(e.message)
    }
  }

  const handleFieldChange = (key, val) => {
    const original = parsed[key]
    let coerced = val
    if (typeof original === 'number') coerced = isNaN(Number(val)) ? val : Number(val)
    const next = { ...parsed, [key]: coerced }
    setParsed(next)
    const text = JSON.stringify(next, null, 2)
    setJsonText(text)
    onChange(text)
  }

  const scalarKeys = Object.entries(parsed).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number'
  )
  const complexKeys = Object.entries(parsed).filter(
    ([, v]) => typeof v !== 'string' && typeof v !== 'number'
  )

  return (
    <div className="border border-neutral-200 bg-neutral-50">
      {/* Mode tabs */}
      <div className="flex border-b border-neutral-200">
        {['fields', 'json'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 text-xs uppercase tracking-widest font-mono transition-colors ${
              mode === m
                ? 'bg-white text-neutral-900 border-r border-neutral-200'
                : 'text-neutral-400 hover:text-neutral-700 border-r border-neutral-200'
            }`}
          >
            {m === 'fields' ? 'KEY FIELDS' : 'EDIT JSON'}
          </button>
        ))}
      </div>

      <div className="p-3">
        {mode === 'fields' ? (
          <div className="space-y-2">
            {scalarKeys.map(([key, val]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 font-mono w-36 shrink-0">{key}</span>
                <input
                  type="text"
                  value={String(val)}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={disabled}
                  className="input flex-1"
                />
              </div>
            ))}
            {complexKeys.map(([key, val]) => (
              <div key={key} className="flex items-start gap-3">
                <span className="text-xs text-neutral-500 font-mono w-36 shrink-0 pt-2">{key}</span>
                <span className="text-xs text-neutral-400 font-mono flex-1 pt-2">
                  {JSON.stringify(val)} <span className="text-neutral-300">(edit in JSON mode)</span>
                </span>
              </div>
            ))}
            {scalarKeys.length === 0 && complexKeys.length === 0 && (
              <div className="text-xs text-neutral-400">Select a profile to see payload fields</div>
            )}
          </div>
        ) : (
          <div>
            <textarea
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              disabled={disabled}
              rows={10}
              className="textarea font-mono text-xs w-full"
              spellCheck={false}
            />
            {parseError && (
              <div className="text-xs text-red-500 mt-1 font-mono">{parseError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ConfigPanel({ config, setConfig, runStatus }) {
  const [profiles, setProfiles] = useState([])
  const [profileDetail, setProfileDetail] = useState(null)

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then(setProfiles)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!config.profile_id) { setProfileDetail(null); return }
    fetch(`/api/profiles/${config.profile_id}`)
      .then((r) => r.json())
      .then(setProfileDetail)
      .catch(() => {})
  }, [config.profile_id])

  const disabled = runStatus !== 'idle'
  const set = (key) => (val) => setConfig((prev) => ({ ...prev, [key]: val }))
  const setVal = (key) => (e) => setConfig((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="panel">
      <div className="panel-title">PROFILE + LOAD CONFIG</div>
      <div className="grid grid-cols-3 gap-6">

        {/* Col 1 — Profile + URLs */}
        <div className="space-y-4">
          <div className="stat-label border-b border-neutral-100 pb-1 mb-3">PROFILE</div>

          <Field label="PROFILE">
            <select value={config.profile_id} onChange={setVal('profile_id')} disabled={disabled} className="select">
              <option value="">— SELECT PROFILE —</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          {profileDetail && (
            <div className="text-xs font-mono space-y-1 bg-neutral-50 border border-neutral-200 p-3">
              <div className="text-neutral-400 uppercase tracking-widest text-xs mb-2">AUTH HEADERS (env-var resolved)</div>
              {(profileDetail.auth_header_names ?? []).map((h) => (
                <div key={h} className="text-neutral-600">{h} <span className="text-neutral-300">← env var</span></div>
              ))}
              {!profileDetail.auth_header_names?.length && (
                <div className="text-neutral-400">No headers defined</div>
              )}
            </div>
          )}

          <Field label="AUTH URL OVERRIDE">
            <input type="url" value={config.auth_url_override} onChange={setVal('auth_url_override')}
              disabled={disabled} placeholder={profileDetail?.auth_url ?? 'uses profile default'} className="input" />
          </Field>

          <Field label="CONFIRM URL OVERRIDE">
            <input type="url" value={config.confirm_url_override} onChange={setVal('confirm_url_override')}
              disabled={disabled} placeholder={profileDetail?.confirmation_url ?? 'uses profile default'} className="input" />
          </Field>
        </div>

        {/* Col 2 — Load params + Card ref */}
        <div className="space-y-4">
          <div className="stat-label border-b border-neutral-100 pb-1 mb-3">LOAD PARAMETERS</div>

          <Field label="CONCURRENCY">
            <NumInput value={config.concurrency} onChange={set('concurrency')} min={1} max={500} disabled={disabled} />
          </Field>
          <Field label="DURATION (S)">
            <NumInput value={config.duration} onChange={set('duration')} min={5} max={3600} disabled={disabled} />
          </Field>
          <Field label="PASS RATIO (0–1)" hint="Fraction of txns intended to pass">
            <NumInput value={config.pass_ratio} onChange={set('pass_ratio')} min={0} max={1} step={0.05} disabled={disabled} />
          </Field>

          <div className="border-t border-neutral-100 pt-4 space-y-3">
            <div className="stat-label border-b border-neutral-100 pb-1 mb-3">CARD REFERENCE</div>

            {/* Card ref list — overrides profile's default list */}
            <Field
              label="CARD REF LIST OVERRIDE"
              hint="One number per line or comma-separated. Blank = use profile default list."
            >
              <textarea
                rows={4}
                value={config._cardRefListText ?? ''}
                onChange={(e) => {
                  const text = e.target.value
                  setConfig((prev) => ({
                    ...prev,
                    _cardRefListText: text,
                    card_ref_list_override: text.trim()
                      ? text.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean)
                      : null,
                  }))
                }}
                disabled={disabled}
                placeholder={
                  profileDetail?.card_reference_list?.length
                    ? `Profile has ${profileDetail.card_reference_list.length} refs — paste here to override`
                    : 'Paste card reference numbers here'
                }
                className="textarea text-xs"
                spellCheck={false}
              />
              {config.card_ref_list_override?.length > 0 && (
                <div className="text-xs text-neutral-500 mt-1">
                  {config.card_ref_list_override.length} refs loaded — rotating through list
                </div>
              )}
              {!config.card_ref_list_override && profileDetail?.card_reference_list?.length > 0 && (
                <div className="text-xs text-neutral-400 mt-1">
                  Using profile default: {profileDetail.card_reference_list.length} refs
                </div>
              )}
            </Field>

            {/* Single static ref (only relevant when no list) */}
            {!config.card_ref_list_override && (
              <Field label="SINGLE CARD REF (NO LIST)" hint="Used when list is empty">
                <input
                  type="text"
                  value={config.card_ref}
                  onChange={setVal('card_ref')}
                  disabled={disabled || config.card_ref_mode === 'rotate'}
                  placeholder={config.card_ref_mode === 'rotate' ? 'auto-generated per txn' : 'e.g. 9965777339'}
                  className="input"
                />
              </Field>
            )}

            <Toggle
              checked={config.card_ref_mode === 'rotate'}
              onChange={(v) => set('card_ref_mode')(v ? 'rotate' : 'static')}
              label="ROTATE — NEW REF PER TXN (when no list)"
              disabled={disabled}
            />
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <Toggle
              checked={config.ramp_mode}
              onChange={set('ramp_mode')}
              label="RAMP MODE"
              disabled={disabled}
            />
            {config.ramp_mode && (
              <div className="mt-3 space-y-3 pl-4 border-l-2 border-neutral-200">
                <Field label="RAMP STEPS">
                  <input
                    type="text"
                    value={config.ramp_steps.join(',')}
                    onChange={(e) =>
                      set('ramp_steps')(
                        e.target.value.split(',').map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v))
                      )
                    }
                    disabled={disabled}
                    className="input"
                  />
                </Field>
                <Field label="STEP DURATION (S)">
                  <NumInput value={config.step_duration} onChange={set('step_duration')} min={5} max={600} disabled={disabled} />
                </Field>
              </div>
            )}
          </div>
        </div>

        {/* Col 3 — Payload editor */}
        <div className="space-y-3">
          <div className="stat-label border-b border-neutral-100 pb-1 mb-3">TXN PAYLOAD TEMPLATE</div>
          <div className="text-xs text-neutral-400 font-mono mb-2 space-y-1">
            <div className="text-neutral-500 uppercase tracking-widest text-xs">TEMPLATE VARIABLES</div>
            {[
              ['{{txn_id}}',                 'unique string ID per txn'],
              ['{{rrn}}',                    '12-digit numeric RRN'],
              ['{{amount}}',                 'float — INR amount'],
              ['{{amount_minor}}',           'int — paise (amount × 100)'],
              ['{{card_ref}}',               'from rotating list or static'],
              ['{{txn_unique_id}}',          'int — shared auth↔notification'],
              ['{{notification_unique_id}}', 'int — notification only'],
              ['{{txn_time}}',               'MM/DD/YYYY HH:MM:SS'],
            ].map(([v, desc]) => (
              <div key={v} className="flex gap-2">
                <span className="text-neutral-700 w-52 shrink-0">{v}</span>
                <span className="text-neutral-400">{desc}</span>
              </div>
            ))}
          </div>
          <PayloadEditor
            profileTemplate={profileDetail?.payload_template ?? null}
            onChange={(json) => set('payload_template_override')(json)}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}
