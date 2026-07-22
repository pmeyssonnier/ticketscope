// Copie les fichiers d'exécution Tesseract (worker + cœur WASM) depuis
// node_modules vers public/tesseract/ afin de servir l'OCR en local
// (aucun CDN tiers). Exécuté avant `dev` et `build`.
//
// Le modèle de langue (public/tesseract/lang/fra.traineddata.gz) est versionné
// dans le dépôt car il n'est pas fourni par npm.

import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'tesseract')
mkdirSync(out, { recursive: true })

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm'],
]

let ok = 0
for (const [from, to] of files) {
  const src = join(root, 'node_modules', from)
  if (!existsSync(src)) {
    console.warn(`[prepare-ocr] introuvable : ${from} (OCR image indisponible tant que les dépendances ne sont pas installées)`) // eslint-disable-line no-console
    continue
  }
  copyFileSync(src, join(out, to))
  ok += 1
}
console.log(`[prepare-ocr] ${ok}/${files.length} fichier(s) Tesseract copié(s) dans public/tesseract/`) // eslint-disable-line no-console
