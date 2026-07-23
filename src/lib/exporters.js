// Exports : Excel (.xlsx), CSV et JSON — conformes au cahier des charges.
// La librairie Excel (SheetJS) est chargée à la demande pour alléger le
// démarrage de la PWA.

import { monthKey } from './format.js'
import { unitPriceFor } from './units.js'

// Aplati les tickets en lignes exploitables (1 ligne = 1 produit).
export function flattenRows(tickets) {
  const rows = []
  for (const t of tickets) {
    for (const it of t.items || []) {
      const up = unitPriceFor(it)
      rows.push({
        ticket_id: t.id,
        date: t.date || '',
        mois: monthKey(t.date),
        magasin: t.store || '',
        libelle_brut: it.raw,
        produit: it.normalized || '',
        marque: it.brand || '',
        format: it.format || '',
        quantite: it.quantity,
        prix_unitaire: it.unitPrice,
        brut: it.gross,
        remise: it.discount,
        net: it.net,
        prix_unitaire_norm: up ? up.value : '',
        unite_prix: up ? up.label : '',
        coicop: it.coicop || '',
        coicop_libelle: it.coicopLabel || '',
        categorie: it.category || '',
        confiance: it.confidence,
      })
    }
  }
  return rows
}

// Synthèse par code COICOP + catégorie (comme la feuille "Synthèse" de référence).
export function summarizeByCoicop(tickets) {
  const map = new Map()
  for (const r of flattenRows(tickets)) {
    const key = `${r.coicop}|${r.categorie}`
    const cur = map.get(key) || {
      coicop: r.coicop,
      coicop_libelle: r.coicop_libelle,
      categorie: r.categorie,
      net: 0,
      lignes: 0,
    }
    cur.net = +(cur.net + r.net).toFixed(2)
    cur.lignes += 1
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.net - a.net)
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportJSON(tickets) {
  const blob = new Blob([JSON.stringify(tickets, null, 2)], {
    type: 'application/json',
  })
  download('ticketscope-export.json', blob)
}

export function exportCSV(tickets) {
  const rows = flattenRows(tickets)
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(';'),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(';')),
  ].join('\n')
  // BOM pour Excel + accents corrects.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  download('ticketscope-export.csv', blob)
}

export async function exportXLSX(tickets) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const rows = flattenRows(tickets)
  const wsLignes = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, wsLignes, 'Lignes')

  const synth = summarizeByCoicop(tickets)
  const wsSynth = XLSX.utils.json_to_sheet(synth)
  XLSX.utils.book_append_sheet(wb, wsSynth, 'Synthèse COICOP')

  // Feuille tickets (en-têtes).
  const head = tickets.map((t) => ({
    ticket_id: t.id,
    date: t.date || '',
    magasin: t.store || '',
    nb_lignes: (t.items || []).length,
    total_net: (t.items || []).reduce((a, b) => a + (b.net || 0), 0).toFixed(2),
    total_declare: t.totalDeclared ?? '',
  }))
  const wsHead = XLSX.utils.json_to_sheet(head)
  XLSX.utils.book_append_sheet(wb, wsHead, 'Tickets')

  XLSX.writeFile(wb, 'ticketscope-export.xlsx')
}
