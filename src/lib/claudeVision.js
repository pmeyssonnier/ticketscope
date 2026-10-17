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
import { parseFormat } from './units.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const COICOP_CODES = Object.keys(COICOP_LABELS)

// Modèles proposés. Haiku 4.5 reste le défaut (éprouvé en production) ;
// les modèles 5.x sont proposés en option.
export const AI_MODELS = {
  'claude-haiku-4-5': { label: 'Haiku 4.5' },
  'claude-haiku-5-5': { label: 'Haiku 5.5' },
  'claude-sonnet-5': { label: 'Sonnet 5' },
  'claude-sonnet-5-5': { label: 'Sonnet 5.5' },
}
export const DEFAULT_AI_MODEL = 'claude-haiku-4-5'
const REQUEST_TIMEOUT_MS = 90_000
const RETRY_STATUS = new Set([429, 529])

// Ramène un identifiant stocké (ex. ancien « claude-haiku-4-5 ») à un modèle supporté.
export function safeModel(model) {
  return AI_MODELS[model] ? model : DEFAULT_AI_MODEL
}

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
        required: ['raw', 'product', 'brand', 'format', 'quantity', 'unit_price', 'discount', 'net', 'coicop', 'category', 'confidence'],
        properties: {
          raw: { type: 'string' },
          product: { type: 'string' },
          brand: { type: 'string' },
          format: { type: 'string' },
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
- "format" = contenance d'UN exemplaire telle qu'imprimée : poids ("750 g", "1 kg"), volume ("880 ml", "1 L", "37,5 cl"), ou nombre ("12 pièces"). Mets "vrac" si vendu au poids, "" si aucune contenance.
- Vêtements et chaussures : le libellé est souvent un nom de modèle suivi de la couleur et de la taille (« DAXFORDMC BLUE,XXL »). Garde-le tel quel dans "raw" ; dans "product", indique le type d'article s'il se déduit (boxer, chemise, pull…), sinon le nom du modèle.
- Rattache une réduction "sur article" au produit concerné : "discount" est négatif, "net" = quantity×unit_price + discount.
- Promotion de lot (ex. « Boxers 3 x 19,99EUR = -3,98 ») : la remise concerne PLUSIEURS articles (ceux marqués du même signe, p. ex. « a », ou de même libellé). Répartis-la à parts égales sur ces articles (centimes d'écart sur le dernier) : la somme des "discount" doit être égale au montant imprimé. Ne la mets jamais en entier sur un seul article.
- Contrôle final : la somme des "net" de toutes les lignes doit être égale à "total_paid".
- Attribue le code COICOP le plus adapté depuis CETTE liste (n'invente pas d'autre code ; si vraiment inconnu, mets "") et une "category" courte en français :
${list}
- "confidence" entre 0 et 1 : ta certitude sur la lecture ET la classification de la ligne.
- "date" au format AAAA-MM-JJ si lisible, sinon "". "total_paid" = total réellement payé (après remises).

Réponds uniquement via le format JSON demandé.`
}

// files : tableau d'images (une ou plusieurs photos du même ticket) OU un PDF.
export async function readReceiptWithClaude(files, { apiKey, model: requestedModel, onProgress }) {
  const model = safeModel(requestedModel)
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

  onProgress?.({ label: `Lecture par Claude (${AI_MODELS[model].label})…`, progress: 0.5 })

  const body = JSON.stringify({
    model,
    max_tokens: 16000,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
  })

  let res
  for (let attempt = 0; ; attempt += 1) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body,
      })
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Délai dépassé (90 s) — réessayez.')
      throw new Error('Connexion à l’API Anthropic impossible.')
    } finally {
      clearTimeout(timer)
    }
    if (RETRY_STATUS.has(res.status) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    break
  }

  if (!res.ok) {
    let msg = `Erreur API (${res.status})`
    if (res.status === 401) msg = 'Clé API invalide ou manquante.'
    else if (res.status === 429) msg = 'Limite de débit atteinte — réessayez dans un instant.'
    else if (res.status === 529) msg = 'API Anthropic surchargée — réessayez dans un instant.'
    else if (res.status === 413) msg = 'Image ou PDF trop volumineux.'
    else {
      try {
        const err = await res.json()
        if (err?.error?.message) msg = err.error.message
      } catch { /* ignore */ }
    }
    throw new Error(msg)
  }

  const json = await res.json()
  if (json.stop_reason === 'refusal') throw new Error('Lecture refusée par le modèle.')
  if (json.stop_reason === 'max_tokens') {
    throw new Error('Ticket trop long : réponse tronquée. Essayez Sonnet ou scindez les photos.')
  }
  const textBlock = (json.content || []).find((b) => b.type === 'text')
  if (!textBlock) throw new Error('Réponse vide de Claude.')
  let parsed
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    throw new Error('Réponse illisible de Claude (JSON invalide).')
  }

  onProgress?.({ label: 'Analyse terminée', progress: 1 })
  const draft = toDraft(parsed)
  if (!draft.items.length) {
    // Diagnostic : on expose ce que l'API a réellement renvoyé.
    const out = json.usage?.output_tokens ?? '?'
    throw new Error(
      `Aucun produit lu (modèle ${model}, stop_reason ${json.stop_reason}, ${out} tokens de sortie). ` +
        `Réponse : ${String(textBlock.text).slice(0, 300)}`,
    )
  }
  return draft
}

// Convertit la réponse de Claude en brouillon exploitable par l'écran de correction.
// Réconcilie les remises avec le total payé imprimé : si la somme des lignes
// s'écarte du total, que des remises existent et que l'écart reste plausible
// (promotion mal lue), on ajuste ces remises proportionnellement et on marque
// les lignes touchées « à confirmer ». Sans remise lue, on ne touche à rien.
export function reconcileDiscounts(items, totalPaid) {
  const total = Number(totalPaid)
  if (!(total > 0)) return items
  const sum = (arr, k) => +arr.reduce((a, b) => a + (Number(b[k]) || 0), 0).toFixed(2)
  const diff = +(total - sum(items, 'net')).toFixed(2)
  if (Math.abs(diff) < 0.02) return items
  const targets = items.filter((it) => it.discount < 0)
  const oldDisc = sum(targets, 'discount')
  if (!targets.length || oldDisc >= 0) return items
  const newDisc = +(oldDisc + diff).toFixed(2)
  const ratio = newDisc / oldDisc
  if (newDisc >= 0 || ratio < 0.5 || ratio > 2) return items
  let left = newDisc
  const last = targets[targets.length - 1]
  return items.map((it) => {
    if (!targets.includes(it)) return it
    const discount = it === last ? +left.toFixed(2) : +(it.discount * ratio).toFixed(2)
    left = +(left - discount).toFixed(2)
    return { ...it, discount, net: +(it.gross + discount).toFixed(2), needsReview: true }
  })
}

export function toDraft(parsed) {
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
      format: (it.format || '').trim() || (parseFormat(it.raw)?.text || ''),
      quantity,
      unitPrice,
      gross,
      discount,
      net: +(gross + discount).toFixed(2),
      coicop,
      coicopLabel: coicopLabel(coicop),
      category: it.category || (coicop ? '' : 'Inconnu'),
      confidence,
      source: 'ia',
      needsReview: !coicop || confidence < 0.75 || discount < -gross,
    }
  })
  return {
    id: uid('tk'),
    createdAt: new Date().toISOString(),
    engine: 'ia',
    store: parsed.store || 'Magasin inconnu',
    date: parsed.date || null,
    items: reconcileDiscounts(items, parsed.total_paid),
    globalDiscountTotal: 0,
    subtotalDeclared: null,
    totalDeclared: parsed.total_paid != null ? +Number(parsed.total_paid).toFixed(2) : null,
  }
}
