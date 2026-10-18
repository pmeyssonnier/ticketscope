// Préférences d'affichage (localStorage). Mode « avancé » : codes COICOP, trois modes d'affichage,
// reclassement en masse, dictionnaire appris, sauvegardes. Absent = parcours « famille ».

const KEY = 'ticketscope.advanced'

export function loadAdvanced() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveAdvanced(on) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
}
