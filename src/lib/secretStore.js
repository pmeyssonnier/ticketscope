// Stockage de la clé API Anthropic.
//
// La clé n'est plus écrite en clair dans localStorage : elle est chiffrée
// (AES-GCM) avec une clé d'appareil NON EXPORTABLE générée par WebCrypto et
// conservée dans IndexedDB. Un export du profil, une sauvegarde ou une lecture
// directe du stockage ne donnent donc que du texte chiffré.
//
// Limite assumée : un script exécuté dans la page pourrait toujours demander le
// déchiffrement (la CSP de vercel.json réduit ce risque).
//
// Mode dégradé (sans WebCrypto/IndexedDB, ou écriture impossible) : la clé n'est
// JAMAIS écrite en clair ; elle reste en mémoire pour la session et
// `saveApiKey` signale l'échec. Une ancienne clé en clair n'est supprimée
// qu'après confirmation (relecture) qu'elle est bien chiffrée ailleurs.
//
// `secretStorageKind()` : 'encrypted' | 'memory' (non conservée) | 'legacy'
// (ancienne clé en clair impossible à chiffrer, laissée en place).

const DB_NAME = 'ticketscope-secrets'
const STORE = 'kv'
const DEVICE_KEY_ID = 'device-key'
const SECRET_ID = 'anthropic-key'
const PLAIN_KEY = 'ticketscope.apikey.v1' // ancien repli en clair (versions 2.6-2.7)
const SETTINGS_KEY = 'ticketscope.ai.v1' // ancien emplacement (clé en clair)

let kind = 'encrypted'

export function secretStorageKind() {
  return kind
}

function canEncrypt() {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle &&
    typeof crypto.getRandomValues === 'function'
  )
}

// --- IndexedDB (petit magasin clé/valeur) ---
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB bloquée'))
  })
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    let req
    try {
      req = fn(t.objectStore(STORE))
    } catch (e) {
      reject(e)
      return
    }
    t.oncomplete = () => resolve(req ? req.result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error('Transaction annulée'))
  })
}

const dbGet = (db, k) => tx(db, 'readonly', (s) => s.get(k))
const dbPut = (db, k, v) => tx(db, 'readwrite', (s) => s.put(v, k))
const dbDel = (db, k) => tx(db, 'readwrite', (s) => s.delete(k))

// --- Chiffrement ---
async function deviceKey(db) {
  let key = await dbGet(db, DEVICE_KEY_ID)
  if (!key) {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await dbPut(db, DEVICE_KEY_ID, key)
  }
  return key
}

async function encrypt(db, text) {
  const key = await deviceKey(db)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))
  return { iv, data }
}

async function decrypt(db, blob) {
  const key = await dbGet(db, DEVICE_KEY_ID)
  if (!key) throw new Error('Clé d’appareil absente')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.iv }, key, blob.data)
  return new TextDecoder().decode(plain)
}

// --- localStorage ---
function lsGet(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
// true si l'écriture a réellement eu lieu.
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v)
    return true
  } catch (e) {
    console.error('TicketScope: échec de sauvegarde locale', e)
    return false
  }
}
function lsDel(k) {
  try {
    localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

// --- Clés en clair héritées (réglages des versions < 2.6, repli 2.6-2.7) ---
function readSettings() {
  const raw = lsGet(SETTINGS_KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw)
    return s && typeof s === 'object' ? s : null
  } catch {
    return null
  }
}

function plaintextLeftover() {
  const fromSettings = String(readSettings()?.apiKey || '').trim()
  return fromSettings || String(lsGet(PLAIN_KEY) || '').trim()
}

// Supprime les copies en clair. À n'appeler qu'une fois la clé confirmée
// chiffrée (ou volontairement effacée) ; ne retire le champ des réglages que si
// leur réécriture réussit.
function removePlaintextLeftovers() {
  lsDel(PLAIN_KEY)
  const settings = readSettings()
  if (settings && 'apiKey' in settings) {
    const { apiKey, ...rest } = settings // eslint-disable-line no-unused-vars
    lsSet(SETTINGS_KEY, JSON.stringify(rest))
  }
}

// --- Écriture / lecture chiffrées ---
async function writeSecret(value) {
  const key = (value || '').trim()
  if (!canEncrypt()) {
    kind = 'memory'
    if (key) throw new Error('Chiffrement indisponible : la clé n’est conservée qu’en mémoire.')
    return
  }
  try {
    const db = await openDb()
    if (key) {
      await dbPut(db, SECRET_ID, await encrypt(db, key))
      // Confirmation par relecture avant de toucher aux copies en clair.
      if ((await decrypt(db, await dbGet(db, SECRET_ID))) !== key) throw new Error('Relecture différente')
    } else {
      await dbDel(db, SECRET_ID)
    }
  } catch (e) {
    kind = 'memory'
    if (key) throw e
    return
  }
  kind = 'encrypted'
  removePlaintextLeftovers()
}

async function readEncrypted() {
  const db = await openDb()
  const blob = await dbGet(db, SECRET_ID)
  if (!blob) return ''
  try {
    return await decrypt(db, blob)
  } catch {
    // Clé d'appareil perdue (données du site purgées en partie) : le texte
    // chiffré est inutilisable, on l'oublie.
    await dbDel(db, SECRET_ID)
    return ''
  }
}

// Écritures sérialisées (la saisie déclenche une sauvegarde à chaque frappe).
// La promesse renvoyée est REJETÉE si la clé n'a pas pu être conservée ; la file,
// elle, continue de fonctionner.
let chain = Promise.resolve()
export function saveApiKey(value) {
  const run = chain.then(() => writeSecret(value))
  chain = run.catch(() => {})
  return run
}

// Charge la clé au démarrage ; chiffre au passage une ancienne clé en clair.
export async function loadApiKey() {
  await chain
  let stored = ''
  if (canEncrypt()) {
    try {
      stored = await readEncrypted()
      kind = 'encrypted'
    } catch (e) {
      console.warn('TicketScope: stockage chiffré indisponible', e)
      kind = 'memory'
    }
  } else {
    kind = 'memory'
  }

  const leftover = plaintextLeftover()
  if (!leftover) return stored
  if (stored) {
    removePlaintextLeftovers() // déjà chiffrée : la copie en clair est superflue
    return stored
  }
  try {
    await writeSecret(leftover) // chiffre, relit, puis seulement retire le clair
    return leftover
  } catch {
    kind = 'legacy' // impossible de chiffrer : on ne touche pas à l'ancienne clé
    return leftover
  }
}
