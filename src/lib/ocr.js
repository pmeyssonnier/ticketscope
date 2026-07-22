// Lecture OCR — 100 % côté client, aucun envoi réseau de l'image/PDF.
//
//  - Images (JPEG/PNG/…) : Tesseract.js (WASM) avec cœur et modèle FR servis
//    localement depuis /tesseract (voir scripts/prepare-ocr.mjs).
//  - PDF : pdf.js. On lit d'abord le texte intégré (PDF « numérique ») ; si le
//    PDF est scanné (peu ou pas de texte), on rend chaque page en image et on
//    la passe à l'OCR.
//
// Les librairies sont importées à la demande pour ne pas alourdir le démarrage.

const OCR_BASE = '/tesseract'

let _workerPromise = null

async function getWorker(onLog) {
  if (!_workerPromise) {
    _workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js')
      return createWorker('fra', OEM.LSTM_ONLY, {
        workerPath: `${OCR_BASE}/worker.min.js`,
        corePath: `${OCR_BASE}/`,
        langPath: `${OCR_BASE}/lang`,
        workerBlobURL: true,
        logger: onLog,
      })
    })().catch((e) => {
      _workerPromise = null
      throw e
    })
  }
  return _workerPromise
}

export async function terminateOcr() {
  if (_workerPromise) {
    try {
      const w = await _workerPromise
      await w.terminate()
    } catch {
      /* ignore */
    }
    _workerPromise = null
  }
}

function makeLogger(onProgress) {
  const labels = {
    'loading tesseract core': 'Chargement du moteur OCR…',
    'initializing tesseract': 'Initialisation…',
    'loading language traineddata': 'Chargement du modèle français…',
    'initializing api': 'Préparation…',
    'recognizing text': 'Reconnaissance du texte…',
  }
  return (m) => {
    if (!onProgress) return
    const label = labels[m.status] || m.status
    onProgress({ label, progress: typeof m.progress === 'number' ? m.progress : 0 })
  }
}

async function ocrImageLike(source, onProgress) {
  const worker = await getWorker(makeLogger(onProgress))
  const { data } = await worker.recognize(source)
  return data.text || ''
}

// --- PDF ---
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

// Reconstruit des lignes de texte à partir des positions des fragments,
// pour préserver « libellé … montant » sur une même ligne (utile au parseur).
function itemsToLines(items) {
  const rows = []
  for (const it of items) {
    const str = it.str
    if (!str || !str.trim()) continue
    const y = Math.round(it.transform[5])
    const x = it.transform[4]
    let row = rows.find((r) => Math.abs(r.y - y) <= 3)
    if (!row) {
      row = { y, cells: [] }
      rows.push(row)
    }
    row.cells.push({ x, str })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows
    .map((r) =>
      r.cells
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .join('\n')
}

async function extractPdf(file, onProgress) {
  const pdfjs = await loadPdfjs()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buf }).promise

  // 1) Tentative : texte intégré.
  const pageTexts = []
  for (let p = 1; p <= pdf.numPages; p += 1) {
    onProgress?.({ label: `Lecture du PDF (page ${p}/${pdf.numPages})…`, progress: p / pdf.numPages })
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    pageTexts.push(itemsToLines(content.items))
  }
  const embedded = pageTexts.join('\n')
  const meaningful = embedded.replace(/\s/g, '').length

  if (meaningful >= 40) {
    return embedded
  }

  // 2) PDF scanné : rendu image + OCR page par page.
  const ocrTexts = []
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    onProgress?.({ label: `OCR du PDF scanné (page ${p}/${pdf.numPages})…`, progress: (p - 1) / pdf.numPages })
    ocrTexts.push(await ocrImageLike(canvas, onProgress))
  }
  return ocrTexts.join('\n')
}

// Point d'entrée unique : accepte une image ou un PDF, renvoie le texte.
export async function extractText(file, onProgress) {
  const type = file.type || ''
  const name = (file.name || '').toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return { text: await extractPdf(file, onProgress), kind: 'pdf' }
  }
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(name)) {
    const text = await ocrImageLike(file, onProgress)
    return { text, kind: 'image' }
  }
  // Repli : lecture texte brute.
  const text = await file.text()
  return { text, kind: 'text' }
}
