import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { flattenRows } from '../lib/exporters.js'
import { formatEUR, monthKey } from '../lib/format.js'
import { coicopDivisionLabel } from '../data/coicop.js'
import { Kpi, Empty } from './ui.jsx'

const PALETTE = ['#0d9488', '#14b8a6', '#f59e0b', '#6366f1', '#e11d48', '#0ea5e9', '#84cc16', '#a855f7', '#f43f5e', '#64748b']

function groupSum(rows, keyFn) {
  const m = new Map()
  for (const r of rows) {
    const k = keyFn(r) || '—'
    m.set(k, +((m.get(k) || 0) + r.net).toFixed(2))
  }
  return [...m.entries()].map(([name, value]) => ({ name, value }))
}

const eurTip = (v) => formatEUR(v)

export default function Dashboard({ tickets }) {
  const rows = useMemo(() => flattenRows(tickets), [tickets])

  const stats = useMemo(() => {
    const net = +rows.reduce((a, b) => a + b.net, 0).toFixed(2)
    const savings = +rows.reduce((a, b) => a + Math.min(b.remise, 0), 0).toFixed(2)
    const avg = tickets.length ? +(net / tickets.length).toFixed(2) : 0
    return { net, savings: Math.abs(savings), avg }
  }, [rows, tickets])

  const byDivision = useMemo(
    () => groupSum(rows, (r) => coicopDivisionLabel(r.coicop)).sort((a, b) => b.value - a.value),
    [rows],
  )
  const byCategory = useMemo(
    () => groupSum(rows, (r) => r.categorie).sort((a, b) => b.value - a.value).slice(0, 8),
    [rows],
  )
  const byStore = useMemo(
    () => groupSum(rows, (r) => r.magasin).sort((a, b) => b.value - a.value),
    [rows],
  )
  const byMonth = useMemo(
    () => groupSum(rows, (r) => monthKey(r.date)).sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  )
  const topProducts = useMemo(
    () => groupSum(rows, (r) => r.produit || r.libelle_brut).sort((a, b) => b.value - a.value).slice(0, 6),
    [rows],
  )

  if (!tickets.length) {
    return (
      <div className="card">
        <Empty icon="📊" title="Aucune donnée pour le moment">
          Importez et enregistrez un ticket pour voir apparaître vos tableaux de
          bord de dépenses.
        </Empty>
      </div>
    )
  }

  return (
    <div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi label="Dépenses totales" value={formatEUR(stats.net)} />
        <Kpi label="Tickets" value={tickets.length} tone="slate" />
        <Kpi label="Économies (promos)" value={formatEUR(stats.savings)} tone="amber" />
        <Kpi label="Panier moyen" value={formatEUR(stats.avg)} tone="slate" />
      </div>

      <div className="grid cols-2">
        <div className="chart-card">
          <h3>Répartition par division COICOP</h3>
          <p className="csub">Part des dépenses par grand poste de consommation</p>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={byDivision} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} isAnimationActive={false} label={(d) => d.name.split(' ')[0]}>
                {byDivision.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={eurTip} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Top catégories</h3>
          <p className="csub">Catégories les plus dépensières</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byCategory} layout="vertical" margin={{ left: 10, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tickFormatter={(v) => `${v}€`} fontSize={11} />
              <YAxis type="category" dataKey="name" width={120} fontSize={11} />
              <Tooltip formatter={eurTip} />
              <Bar dataKey="value" fill="#0d9488" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Dépenses par magasin</h3>
          <p className="csub">Où va votre budget</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byStore} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis tickFormatter={(v) => `${v}€`} fontSize={11} />
              <Tooltip formatter={eurTip} />
              <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Évolution mensuelle</h3>
          <p className="csub">Dépenses par mois</p>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={byMonth} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis tickFormatter={(v) => `${v}€`} fontSize={11} />
              <Tooltip formatter={eurTip} />
              <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card" style={{ marginTop: 16 }}>
        <h3>Top produits</h3>
        <p className="csub">Vos postes de dépense les plus élevés</p>
        {topProducts.map((p, i) => (
          <div className="list-row" key={p.name}>
            <div className="pill" style={{ background: PALETTE[i % PALETTE.length], color: '#fff' }}>
              {i + 1}
            </div>
            <div className="lr-main">
              <div className="lr-title">{p.name}</div>
            </div>
            <div className="lr-amount">{formatEUR(p.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
