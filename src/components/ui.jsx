import React from 'react'
import { formatPct } from '../lib/format.js'

// Deux notions distinctes : la confiance de LECTURE (OCR / IA : a-t-on bien lu le
// libellé et les montants ?) et la confiance de CLASSEMENT (COICOP).
const CONF_KINDS = {
  read: { label: 'Lecture', title: 'Confiance de la lecture (OCR / IA) : libellé et montants bien lus ?' },
  class: { label: 'Classement', title: 'Confiance du classement COICOP : bon code produit ?' },
}

export function ConfidenceBadge({ value, kind }) {
  const level = value >= 0.85 ? 'high' : value >= 0.75 ? 'mid' : 'low'
  const icon = level === 'high' ? '●' : level === 'mid' ? '◐' : '○'
  const k = CONF_KINDS[kind]
  return (
    <span className={`conf ${level}`} title={k ? k.title : 'Taux de confiance de la classification'}>
      {icon} {k ? `${k.label} ` : ''}
      {formatPct(value)}
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
