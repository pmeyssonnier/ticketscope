// Lecture de ticket par la vision de Claude (Haiku / Sonnet).
//
// Appel direct navigateur -> API Anthropic (BYOK : la clé reste sur l'appareil).
// Claude lit l'image (ou le PDF), extrait les lignes, normalise les produits et
// attribue un code COICOP en un seul appel, renvoyé en JSON structuré.
//
// ⚠️ Ce mode envoie l'image à l'API Anthropic (elle quitte l'appareil). L'OCR
// local (Tesseract) reste l'option par défaut, 100 % hors-ligne.

import { COICOP_LABELS, coicopLabel } from '../data/coicop.js'
import { uid, normalizeStr, titleFromRaw } from './format.js'
import { parseFormat } from './units.js'
import { computeNeedsReview } from './review.js'
import { roundMoney, mulMoney, sumMoney } from './money.js'

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
  required: ['store', 'date', 'items', 'promotions', 'total_paid'],
  properties: {
    store: { type: 'string' },
    date: { type: 'string' }, // AAAA-MM-JJ si lisible, sinon ''
    total_paid: { type: 'number' },
    // Promotions de lot (« Boxers 3 x 19,99EUR = -3,98 ») : jamais des produits.
    promotions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'amount', 'item_numbers'],
        properties: {
          label: { type: 'string' },
          amount: { type: 'number' }, // négatif, tel qu'imprimé
          item_numbers: { type: 'array', items: { type: 'integer' } }, // rang (dès 1) dans "items"
        },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['raw', 'product', 'brand', 'format', 'quantity', 'unit_price', 'discount', 'net', 'coicop', 'category', 'read_confidence', 'class_confidence'],
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
          read_confidence: { type: 'number' }, // lecture : libellé et montants bien lus ?
          class_confidence: { type: 'number' }, // classement : bon code COICOP ?
        },
      },
    },
  },
}

export function buildPrompt() {
  const list = COICOP_CODES.map((c) => `- ${c} : ${COICOP_LABELS[c]}`).join('\n')
  return `Tu es un expert des tickets de caisse belges. Lis ce ticket et renvoie ses lignes de PRODUITS.

Consignes :
- Ignore l'en-tête (enseigne, adresse, TVA, téléphone, n° de ticket, caisse, caissier), les totaux, les moyens de paiement et les codes (POI...).
- Regroupe les lignes de produit strictement identiques (même libellé, même prix) en une seule avec "quantity" = nombre d'exemplaires.
- "raw" = libellé exact imprimé sur le ticket. "product" = nom normalisé lisible en français. "brand" = marque si identifiable, sinon "".
- "format" = contenance d'UN exemplaire telle qu'imprimée : poids ("750 g", "1 kg"), volume ("880 ml", "1 L", "37,5 cl"), ou nombre ("12 pièces"). Mets "vrac" si vendu au poids, "" si aucune contenance.
- Vêtements et chaussures : le libellé est souvent un nom de modèle suivi de la couleur et de la taille (« DAXFORDMC BLUE,XXL »). Garde-le tel quel dans "raw" ; dans "product", indique le type d'article UNIQUEMENT si le libellé ou une promotion qui le vise (« item_numbers ») le dit clairement ; sinon recopie le nom du modèle (« Daxfordmc »). Un libellé de promotion ne s'applique qu'aux articles de ses « item_numbers » : ne donne jamais son nom aux autres articles, et ne devine pas un type d'article à partir d'un autre article du ticket.
- Le prix d'un article est le montant imprimé à droite de SA propre ligne. Ne le déduis jamais d'un autre prix du ticket (prix de lot d'une promotion, total, sous-total) : recopie chaque chiffre tel qu'imprimé (17,99 reste 17,99).
- Codes d'habillement : vêtements, y compris sous-vêtements (boxer, slip, chemise, pull, pantalon…) = 03.1.2 ; 03.1.3 seulement pour les accessoires (ceinture, écharpe, gants, bonnet, chaussettes…) ; chaussures = 03.2.1.
- Rattache une réduction "sur article" au produit concerné : "discount" est négatif, "net" = quantity×unit_price + discount.
- Promotion de lot (ex. « Boxers 3 x 19,99EUR = -3,98 » : un libellé suivi d'un montant NÉGATIF) : ce n'est PAS un produit. Ne la mets JAMAIS dans "items" ; décris-la dans "promotions" avec "label" (libellé imprimé), "amount" (négatif, tel qu'imprimé) et "item_numbers" (rang, à partir de 1, dans "items", des articles concernés, p. ex. ceux marqués « a »). Chaque article concerné garde SON propre prix imprimé (7,99), jamais le prix du lot, et n'a pas de "discount" pour cette promotion.
- Remise globale du récapitulatif (coupon, carte de fidélité…) qui n'est rattachée à aucun article : mets-la aussi dans "promotions", avec "item_numbers": [] (sans doublon avec une remise déjà rattachée à un article ou une promotion de lot).
- Contrôle final : la somme des "net" des "items" PLUS la somme des "amount" des "promotions" doit être égale à "total_paid", à quelques centimes d'arrondi près. Si l'écart est plus grand, relis les prix imprimés plutôt que d'inventer un ajustement.
- Attribue le code COICOP le plus adapté depuis CETTE liste (n'invente pas d'autre code ; si vraiment inconnu, mets "") et une "category" courte en français :
${list}
- Deux certitudes distinctes, entre 0 et 1 :
  - "read_confidence" : ta certitude d'avoir bien LU la ligne (libellé, quantité, prix). Baisse-la si le texte est flou, coupé, ambigu ou si un chiffre est incertain, même si le produit est évident.
  - "class_confidence" : ta certitude que le code COICOP choisi est le bon pour ce produit, indépendamment de la qualité de lecture.
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
// Une promotion de lot (« Boxers 3 x 19,99EUR = -3,98 ») est gardée telle quelle :
// une ligne négative dans la liste, sans rattachement aux articles. Le total du
// ticket reste exact et l'utilisateur la voit et la corrige comme n'importe quelle ligne.
const PROMO_LINE = /\b\d+\s*[x×]\s*\d+[.,]\d{2}\s*(?:eur|€)/i

function discountLine(item, amount, label, coicop) {
  const net = roundMoney(amount)
  return {
    ...item,
    raw: label || item.raw,
    normalized: 'Remise',
    brand: '',
    format: '',
    quantity: 1,
    unitPrice: net,
    gross: net,
    discount: 0,
    net,
    coicop: coicop || null,
    coicopLabel: coicopLabel(coicop || null),
    category: 'Remise',
  }
}

// Ajoute les promotions (liste « promotions » de la réponse) et convertit en
// ligne négative une promotion restée parmi les produits (remise négative +
// libellé « N x prix EUR »).
export function withPromotionLines(items, promotions) {
  const out = items.map((it) =>
    it.discount < 0 && PROMO_LINE.test(it.raw || '') ? discountLine(it, it.discount, it.raw, it.coicop) : it,
  )
  for (const promo of Array.isArray(promotions) ? promotions : []) {
    const amount = Number(promo?.amount)
    if (!(amount < 0)) continue
    const first = (promo.item_numbers || []).map((n) => items[Number(n) - 1]).find((x) => x && x.coicop)
    out.push(discountLine({ id: uid('it'), confidence: 0.8, source: 'ia', needsReview: false }, amount, promo.label || 'Remise', first && first.coicop))
  }
  return out
}

// Le type d'article d'une promotion de lot (« Boxers 3 x 19,99EUR » → « Boxer »)
// ne vaut que pour les articles qu'elle vise. Le modèle l'étend parfois à tous les
// articles du ticket : on le remet sur les articles visés et on rend aux autres
// leur nom de modèle. Sans rattachement fiable (plus d'articles visés que le « N x »
// du libellé), on ne touche à rien.
export function namePromotedItems(items, promotions) {
  const out = items.map((it) => ({ ...it }))
  for (const promo of Array.isArray(promotions) ? promotions : []) {
    const m = /^\s*([A-Za-zÀ-ÿ'-]{3,}?)s?\s+(\d+)\s*[x×]/i.exec(promo?.label || '')
    if (!m) continue
    const type = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
    const linked = new Set((promo.item_numbers || []).map((n) => Number(n) - 1).filter((i) => out[i]))
    if (!linked.size || linked.size > Number(m[2])) continue
    out.forEach((it, i) => {
      if (linked.has(i)) it.normalized = type
      else if (normalizeStr(it.normalized) === normalizeStr(type)) it.normalized = titleFromRaw(it.raw) || it.raw
    })
  }
  return out
}

export function toDraft(parsed) {
  const items = (parsed.items || []).map((it) => {
    const coicop = it.coicop || null
    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0))
    // Compatibilité : une ancienne réponse n'a qu'une « confidence » (lecture ET classement).
    const confidence = clamp01(it.class_confidence ?? it.confidence)
    const readConfidence = it.read_confidence != null ? clamp01(it.read_confidence) : null
    const quantity = Number(it.quantity) || 1
    const unitPrice = roundMoney(Number(it.unit_price) || 0)
    const discount = roundMoney(Number(it.discount) || 0)
    const gross = mulMoney(quantity, unitPrice)
    const line = {
      id: uid('it'),
      raw: it.raw || it.product || '',
      normalized: it.product || '',
      brand: it.brand || '',
      format: (it.format || '').trim() || (parseFormat(it.raw)?.text || ''),
      quantity,
      unitPrice,
      gross,
      discount,
      net: sumMoney([gross, discount]),
      coicop,
      coicopLabel: coicopLabel(coicop),
      category: it.category || (coicop ? '' : 'Inconnu'),
      confidence,
      readConfidence,
      source: 'ia',
    }
    return { ...line, needsReview: computeNeedsReview(line) || discount < -gross }
  })
  return {
    id: uid('tk'),
    createdAt: new Date().toISOString(),
    engine: 'ia',
    store: parsed.store || 'Magasin inconnu',
    date: parsed.date || null,
    items: withPromotionLines(namePromotedItems(items, parsed.promotions), parsed.promotions),
    globalDiscountTotal: 0,
    subtotalDeclared: null,
    totalDeclared: parsed.total_paid != null ? roundMoney(parsed.total_paid) : null,
  }
}
