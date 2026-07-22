// Pré-traitement d'image pour fiabiliser l'OCR des tickets de caisse.
//
// Pipeline (tout en canvas, côté client) :
//   1. Décodage en respectant l'orientation EXIF (photos de téléphone).
//   2. Redimensionnement vers une résolution idéale pour Tesseract.
//   3. Niveaux de gris.
//   4. Égalisation de l'éclairage (division par le fond) — supprime ombres et
//      dégradés, principale cause d'échec sur les tickets.
//   5. Étirement de contraste (percentiles) pour un texte bien noir sur blanc.
//   6. Débruitage léger (retrait des pixels isolés).
//   7. Redressement (deskew) par profil de projection.
//
// Renvoie un <canvas> prêt à passer à l'OCR.

const MAX_SIDE = 2400
const MIN_SIDE = 1600

async function decode(file) {
  // createImageBitmap applique l'orientation EXIF et est rapide.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* repli ci-dessous */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function targetScale(w, h) {
  const long = Math.max(w, h)
  if (long > MAX_SIDE) return MAX_SIDE / long
  if (long < MIN_SIDE) return Math.min(MIN_SIDE / long, 2) // n'agrandit pas plus de 2×
  return 1
}

// Image intégrale -> moyenne locale rapide (O(n)).
function integral(gray, w, h) {
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0
    for (let x = 0; x < w; x += 1) {
      rowSum += gray[y * w + x]
      I[(y + 1) * (w + 1) + (x + 1)] = I[y * (w + 1) + (x + 1)] + rowSum
    }
  }
  return I
}

function boxMean(I, w, h, x, y, r) {
  const x0 = Math.max(0, x - r)
  const y0 = Math.max(0, y - r)
  const x1 = Math.min(w - 1, x + r)
  const y1 = Math.min(h - 1, y + r)
  const W = w + 1
  const sum =
    I[(y1 + 1) * W + (x1 + 1)] -
    I[y0 * W + (x1 + 1)] -
    I[(y1 + 1) * W + x0] +
    I[y0 * W + x0]
  const area = (x1 - x0 + 1) * (y1 - y0 + 1)
  return sum / area
}

// Égalisation d'éclairage : chaque pixel divisé par le fond local (moyenne
// large), ce qui aplatit ombres et dégradés.
function flattenIllumination(gray, w, h) {
  const I = integral(gray, w, h)
  const r = Math.max(12, Math.round(Math.min(w, h) / 14))
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const bg = boxMean(I, w, h, x, y, r) + 1
      out[y * w + x] = Math.min(255, (gray[y * w + x] / bg) * 200)
    }
  }
  return out
}

// Étirement de contraste sur les 2e / 98e percentiles.
function stretchContrast(f, out) {
  const hist = new Uint32Array(256)
  for (let i = 0; i < f.length; i += 1) hist[Math.max(0, Math.min(255, f[i] | 0))] += 1
  const total = f.length
  const loCut = total * 0.02
  const hiCut = total * 0.98
  let acc = 0
  let lo = 0
  let hi = 255
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v]
    if (acc <= loCut) lo = v
    if (acc <= hiCut) hi = v
  }
  if (hi <= lo) {
    hi = 255
    lo = 0
  }
  const scale = 255 / (hi - lo)
  for (let i = 0; i < f.length; i += 1) {
    out[i] = Math.max(0, Math.min(255, (f[i] - lo) * scale)) | 0
  }
}

// Retire les pixels sombres isolés (bruit "sel").
function despeckle(g, w, h) {
  const out = g.slice()
  const T = 128
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x
      if (g[i] >= T) continue
      let dark = 0
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1)
          if (!(dx === 0 && dy === 0) && g[(y + dy) * w + (x + dx)] < T) dark += 1
      if (dark <= 1) out[i] = 255
    }
  }
  return out
}

// Estimation de l'angle d'inclinaison via variance du profil de projection,
// calculée sur une version réduite (rapide).
function estimateSkew(g, w, h) {
  const sw = Math.min(520, w)
  const sh = Math.round((sw / w) * h)
  const small = new Uint8Array(sw * sh)
  for (let y = 0; y < sh; y += 1) {
    const sy = Math.floor((y / sh) * h)
    for (let x = 0; x < sw; x += 1) {
      const sx = Math.floor((x / sw) * w)
      small[y * sw + x] = g[sy * w + sx] < 140 ? 1 : 0
    }
  }
  const score = (angle) => {
    const t = Math.tan((angle * Math.PI) / 180)
    const bins = new Float64Array(sh + Math.ceil(Math.abs(t) * sw) + 2)
    const off = Math.ceil(Math.abs(t) * sw) + 1
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        if (!small[y * sw + x]) continue
        const yy = Math.round(y - x * t) + off
        if (yy >= 0 && yy < bins.length) bins[yy] += 1
      }
    }
    let s = 0
    for (let i = 0; i < bins.length; i += 1) s += bins[i] * bins[i]
    return s
  }
  let best = 0
  let bestScore = score(0)
  for (let a = -10; a <= 10; a += 0.5) {
    if (a === 0) continue
    const s = score(a)
    if (s > bestScore) {
      bestScore = s
      best = a
    }
  }
  // affinage
  let refined = best
  for (let a = best - 0.5; a <= best + 0.5; a += 0.15) {
    const s = score(a)
    if (s > bestScore) {
      bestScore = s
      refined = a
    }
  }
  return refined
}

function grayCanvas(g, w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < g.length; i += 1) {
    const v = g[i]
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

function rotateCanvas(src, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  const canvas = document.createElement('canvas')
  canvas.width = src.width
  canvas.height = src.height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return canvas
}

// Point d'entrée. `source` : File image OU canvas (page PDF déjà rendue).
export async function preprocessImage(source) {
  let baseCanvas
  if (source instanceof HTMLCanvasElement) {
    baseCanvas = source
  } else {
    const bmp = await decode(source)
    const scale = targetScale(bmp.width, bmp.height)
    baseCanvas = document.createElement('canvas')
    baseCanvas.width = Math.round(bmp.width * scale)
    baseCanvas.height = Math.round(bmp.height * scale)
    const ctx = baseCanvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, baseCanvas.width, baseCanvas.height)
    if (bmp.close) bmp.close()
  }

  const w = baseCanvas.width
  const h = baseCanvas.height
  const ctx = baseCanvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, w, h)

  // Niveaux de gris (luminance).
  const gray = new Float32Array(w * h)
  for (let i = 0; i < gray.length; i += 1) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }

  const flat = flattenIllumination(gray, w, h)
  const stretched = new Uint8Array(w * h)
  stretchContrast(flat, stretched)
  const clean = despeckle(stretched, w, h)

  const angle = estimateSkew(clean, w, h)
  let out = grayCanvas(clean, w, h)
  if (Math.abs(angle) > 0.4) out = rotateCanvas(out, -angle)
  return out
}
