// Lecture de ticket par la vision de Claude (Haiku / Sonnet).
//
// Appel direct navigateur -> API Anthropic (BYOK : la clé reste sur l'appareil).
// Claude lit l'image (ou le PDF), extrait les lignes, normalise les produits et
// attribue un code COICOP en un seul appel, renvoyé en JSON structuré.
//
// ⚠️ Ce mode envoie l'image à l'API Anthropic (elle quitte l'appareil). L'OCR
// local (Tesseract) reste l'option par défaut, 100 % hors-ligne.

import { COICOP_LABELS, coicopLabel } from '../data/coicop.js'
import { uid } from './format.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const COICOP_CODES = Object.keys(COICOP_LABELS)

// Redimensionne une image (max ~1600 px) pour limiter le coût en tokens.
async function imageToBase64(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  if (!bitmap) {
    // Repli : encodage brut
    const buf = new Uint8Array(await file.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i])
    return { media_type: file.type || 'image/jpeg', data: btoa(bin) }
  }
  const max = 1600
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  if (bitmap.close) bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  return { media_type: 'image/jpeg', data: dataUrl.split(',')[1] }
}

async function pdfToBase64(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i])
  return btoa(bin)
}

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['store', 'date', 'items', 'total_paid'],
  properties: {
    store: { type: 'string' },
    date: { type: 'string' }, // AAAA-MM-JJ si lisible, sinon ''
    total_paid: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['raw', 'product', 'brand', 'quantity', 'unit_price', 'discount', 'net', 'coicop', 'category', 'confidence'],
        properties: {
          raw: { type: 'string' },
          product: { type: 'string' },
          brand: { type: 'string' },
          quantity: { type: 'number' },
          unit_price: { type: 'number' },
          discount: { type: 'number' },
          net: { type: 'number' },
          coicop: { type: 'string', enum: [...COICOP_CODES, ''] },
          category: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
  },
}

function buildPrompt() {
  const list = COICOP_CODES.map((c) => `- ${c} : ${COICOP_LABELS[c]}`).join('\n')
  return `Tu es un expert des tickets de caisse belges. Lis ce ticket et renvoie ses lignes de PRODUITS.

Consignes :
- Ignore l'en-tête (enseigne, adresse, TVA, téléphone, n° de ticket, caisse, caissier), les totaux, les remises globales du récapitulatif, les moyens de paiement et les codes (POI...).
- Regroupe les lignes de produit strictement identiques (même libellé, même prix) en une seule avec "quantity" = nombre d'exemplaires.
- "raw" = libellé exact imprimé sur le ticket. "product" = nom normalisé lisible en français. "brand" = marque si identifiable, sinon "".
- Rattache une réduction "sur article" au produit concerné : "discount" est négatif, "net" = quantity×unit_price + discount.
- Attribue le code COICOP le plus adapté depuis CETTE liste (n'invente pas d'autre code ; si vraiment inconnu, mets "") et une "category" courte en français :
${list}
- "confidence" entre 0 et 1 : ta certitude sur la lecture ET la classification de la ligne.
- "date" au format AAAA-MM-JJ si lisible, sinon "". "total_paid" = total réellement payé (après remises).

Réponds uniquement via le format JSON demandé.`
}

// files : tableau d'images (une ou plusieurs photos du même ticket) OU un PDF.
export async function readReceiptWithClaude(files, { apiKey, model, onProgress }) {
  onProgress?.({ label: "Préparation de l'image…", progress: 0.15 })
  const content = []
  for (const f of files) {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await pdfToBase64(f) } })
    } else {
      const { media_type, data } = await imageToBase64(f)
      content.push({ type: 'image', source: { type: 'base64', media_type, data } })
    }
  }
  content.push({ type: 'text', text: buildPrompt() })

  onProgress?.({ label: `Lecture par Claude (${model.includes('haiku') ? 'Haiku' : 'Sonnet'})…`, progress: 0.5 })

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
    }),
  })

  if (!res.ok) {
    let msg = `Erreur API (${res.status})`
    try {
      const err = await res.json()
      if (res.status === 401) msg = 'Clé API invalide ou manquante.'
      else if (res.status === 429) msg = 'Limite de débit atteinte — réessayez dans un instant.'
      else if (err?.error?.message) msg = err.error.message
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  const json = await res.json()
  const textBlock = (json.content || []).find((b) => b.type === 'text')
  if (!textBlock) throw new Error('Réponse vide de Claude.')
  const parsed = JSON.parse(textBlock.text)

  onProgress?.({ label: 'Analyse terminée', progress: 1 })
  return toDraft(parsed)
}

// Convertit la réponse de Claude en brouillon exploitable par l'écran de correction.
function toDraft(parsed) {
  const items = (parsed.items || []).map((it) => {
    const coicop = it.coicop || null
    const confidence = Math.max(0, Math.min(1, Number(it.confidence) || 0))
    const quantity = Number(it.quantity) || 1
    const unitPrice = +(Number(it.unit_price) || 0).toFixed(2)
    const discount = +(Number(it.discount) || 0).toFixed(2)
    const gross = +(quantity * unitPrice).toFixed(2)
    return {
      id: uid('it'),
      raw: it.raw || it.product || '',
      normalized: it.product || '',
      brand: it.brand || '',
      quantity,
      unitPrice,
      gross,
      discount,
      net: it.net != null ? +Number(it.net).toFixed(2) : +(gross + discount).toFixed(2),
      coicop,
      coicopLabel: coicopLabel(coicop),
      category: it.category || (coicop ? '' : 'Inconnu'),
      confidence,
      source: 'ia',
      needsReview: !coicop || confidence < 0.75,
    }
  })
  return {
    id: uid('tk'),
    createdAt: new Date().toISOString(),
    store: parsed.store || 'Magasin inconnu',
    date: parsed.date || null,
    items,
    globalDiscountTotal: 0,
    subtotalDeclared: null,
    totalDeclared: parsed.total_paid != null ? +Number(parsed.total_paid).toFixed(2) : null,
  }
}
