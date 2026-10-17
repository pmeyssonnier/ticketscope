// `npm run eval` : affiche la précision du pipeline sur le jeu annoté.
import { readFileSync, writeFileSync } from 'node:fs'
import { evaluate } from './evaluate.js'

const dataset = JSON.parse(readFileSync(new URL('./dataset.json', import.meta.url), 'utf8'))
const results = evaluate(dataset)
const pct = (v) => (v == null ? '  —  ' : `${(v * 100).toFixed(1).padStart(5)}%`)

console.log(`Jeu annoté : ${dataset.tickets.map((t) => `${t.id} (${t.items.length} lignes)`).join(', ')}\n`)
console.log('Bruit OCR │ lignes retrouvées │ précision │ net exact │ COICOP exact │ couverture │ erreurs signalées │ total cohérent')
console.log('──────────┼───────────────────┼───────────┼───────────┼──────────────┼────────────┼───────────────────┼───────────────')
for (const [rate, r] of Object.entries(results)) {
  console.log(
    `${(Number(rate) * 100).toFixed(0).padStart(7)}%  │ ${pct(r.recall).padStart(17)} │ ${pct(r.precision)}   │ ${pct(r.netAccuracy)}   │ ${pct(r.coicopAccuracy).padStart(12)} │ ${pct(r.coverage).padStart(10)} │ ${pct(r.errorDetection).padStart(17)} │ ${pct(r.totalReconciled).padStart(13)}`,
  )
}
console.log('\nCalibration de la confiance de classement (part de bons codes par tranche) :')
for (const [rate, r] of Object.entries(results)) {
  const cal = Object.values(r.calibration)
    .map((b) => `${b.label} : ${pct(b.accuracy)} (n=${b.n})`)
    .join('   ')
  console.log(`  bruit ${(Number(rate) * 100).toFixed(0).padStart(2)}% → ${cal}`)
}
console.log('\nPar ticket (bruit 0 %) :')
for (const [id, t] of Object.entries(results[0].perTicket)) {
  console.log(`  ${id.padEnd(24)} lignes ${pct(t.recall)}  net ${pct(t.netAccuracy)}  COICOP ${pct(t.coicopAccuracy)}  couverture ${pct(t.coverage)}`)
}
if (process.argv.includes('--json')) {
  writeFileSync(new URL('./results.json', import.meta.url), `${JSON.stringify(results, null, 2)}\n`)
  console.log('\nRésultats écrits dans eval/results.json')
}
