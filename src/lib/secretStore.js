// Stockage de la clé API Anthropic.
//
// La clé n'est plus écrite en clair dans localStorage : elle est chiffrée
// (AES-GCM) avec une clé d'appareil NON EXPORTABLE générée par WebCrypto et
// conservée dans IndexedDB. Un export du profil, une sauvegarde ou une lecture
// directe du stockage ne donnent donc que du texte chiffré.
//
// Limite assumée : un script exécuté dans la page pourrait toujours demander le
// déchiffrement (la CSP de vercel.json réduit ce risque). Sans WebCrypto ou
// IndexedDB (contexte non sécurisé, navigateur restreint), repli sur
// localStorage en clair — `secretStorageKind()` le signale à l'interface.

const DB_NAME = 'ticketscope-secrets'
const STORE = 'kv'
const DEVICE_KEY_ID = 'device-key'
const SECRET_ID = 'anthropic-key'
const PLAIN_KEY = 'ticketscope.apikey.v1' // repli sans chiffrement
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

// --- localStorage (repli) ---
function lsGet(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v)
  } catch (e) {
    console.error('TicketScope: échec de sauvegarde locale', e)
  }
}
function lsDel(k) {
  try {
    localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

async function readSecret() {
  if (canEncrypt()) {
    try {
      const db = await openDb()
      const blob = await dbGet(db, SECRET_ID)
      if (blob) {
        try {
          kind = 'encrypted'
          return await decrypt(db, blob)
        } catch {
          // Clé d'appareil perdue (données du site purgées en partie) : le texte
          // chiffré est inutilisable, on l'oublie.
          await dbDel(db, SECRET_ID)
          return ''
        }
      }
      kind = 'encrypted'
    } catch (e) {
      console.warn('TicketScope: stockage chiffré indisponible', e)
      kind = 'plain'
    }
  } else {
    kind = 'plain'
  }
  return lsGet(PLAIN_KEY) || ''
}

async function writeSecret(value) {
  const key = (value || '').trim()
  if (canEncrypt()) {
    try {
      const db = await openDb()
      if (key) await dbPut(db, SECRET_ID, await encrypt(db, key))
      else await dbDel(db, SECRET_ID)
      lsDel(PLAIN_KEY) // jamais de copie en clair à côté
      kind = 'encrypted'
      return
    } catch (e) {
      console.warn('TicketScope: chiffrement impossible, repli sur localStorage', e)
    }
  } 
  kind = 'plain'
  if (key) lsSet(PLAIN_KEY, key)
  else lsDel(PLAIN_KEY)
}

// Écritures sérialisées (la saisie déclenche une sauvegarde à chaque frappe).
let chain = Promise.resolve()
export function saveApiKey(value) {
  chain = chain.then(() => writeSecret(value)).catch((e) => console.error(e))
  return chain
}

// Ancienne version : la clé était dans localStorage avec les réglages.
// On la chiffre, puis on la retire des réglages — seulement après réussite.
async function migrateLegacy() {
  const raw = lsGet(SETTINGS_KEY)
  if (!raw) return
  let settings
  try {
    settings = JSON.parse(raw)
  } catch {
    return
  }
  if (!settings || typeof settings !== 'object' || !('apiKey' in settings)) return
  const legacy = String(settings.apiKey || '').trim()
  if (legacy) await saveApiKey(legacy)
  const { apiKey, ...rest } = settings // eslint-disable-line no-unused-vars
  lsSet(SETTINGS_KEY, JSON.stringify(rest))
}

export async function loadApiKey() {
  await chain
  await migrateLegacy()
  return readSecret()
}
