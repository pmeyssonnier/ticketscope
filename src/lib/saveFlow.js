// Enregistrement d'un ticket corrigé : le ticket d'abord, l'apprentissage ensuite.
//
// Si l'écriture du ticket échoue (exception), RIEN n'est appris : le dictionnaire
// ne doit pas évoluer pour un ticket qui n'existe pas. Un échec d'apprentissage,
// lui, ne remet pas en cause le ticket : il est compté et signalé à part.

export async function saveTicketThenLearn(ticket, corrections, { save, learn }) {
  await save(ticket)
  let learnFailed = 0
  for (const c of corrections || []) {
    if (learn(c.raw, c.correction) === false) learnFailed += 1
  }
  return { learnFailed }
}
