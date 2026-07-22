import React from 'react'
import { formatPct } from '../lib/format.js'

export function ConfidenceBadge({ value }) {
  const level = value >= 0.85 ? 'high' : value >= 0.75 ? 'mid' : 'low'
  const icon = level === 'high' ? '●' : level === 'mid' ? '◐' : '○'
  return (
    <span className={`conf ${level}`} title="Taux de confiance de la classification">
      {icon} {formatPct(value)}
    </span>
  )
}

export function Kpi({ label, value, tone = 'teal' }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone}`}>{value}</div>
    </div>
  )
}

export function Empty({ icon = '🧾', title, children }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div className="muted">{children}</div>
    </div>
  )
}
