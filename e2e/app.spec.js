import { test, expect } from '@playwright/test'
import fs from 'node:fs'

// Parcours critiques sur téléphone (Pixel 7) : voir playwright.config.js.

// Premier lancement : le service worker s'installe, prend la main puis recharge la
// page (autoUpdate). On attend ce rechargement pour ne pas agir sur une page
// qui va disparaître ; chaque test part ainsi d'un état stable.
// Ces scénarios testent l'interface complète : on active le mode avancé.
async function openApp(page) {
  await page.addInitScript(() => localStorage.setItem('ticketscope.advanced', '1'))
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30_000 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'TicketScope BE' })).toBeVisible()
}

async function saveSampleTicket(page) {
  await openApp(page)
  await page.getByRole('button', { name: /Exemple/ }).click()
  await page.getByRole('button', { name: /Analyser le ticket/ }).click()
  await expect(page.getByRole('heading', { name: /Vérification/ })).toBeVisible()
  await page.getByRole('button', { name: /Enregistrer/ }).first().click()
  await expect(page.locator('nav .badge')).toHaveText('1')
}

const openHistory = (page) => page.locator('nav button').nth(2).click()

test('ticket exemple → correction → enregistrement, conservé après rechargement', async ({ page }) => {
  await saveSampleTicket(page)
  await page.reload()
  await expect(page.locator('nav .badge')).toHaveText('1')
  await openHistory(page)
  await expect(page.getByText(/ticket\(s\)/).first()).toBeVisible()
})

test('sauvegarde complète puis restauration sur un appareil vierge', async ({ page, browser }, testInfo) => {
  await saveSampleTicket(page)
  await openHistory(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Sauvegarder/ }).click()])
  const file = testInfo.outputPath('sauvegarde.json')
  await download.saveAs(file)
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'))
  expect(backup).toMatchObject({ type: 'backup', version: 1 })
  expect(backup.tickets).toHaveLength(1)
  expect(fs.readFileSync(file, 'utf8')).not.toMatch(/apiKey|sk-ant/)
  await expect(page.locator('[role=note]')).toContainText("Dernière sauvegarde : aujourd'hui")

  // Appareil vierge : nouveau contexte (stockage séparé).
  const fresh = await browser.newContext({ ...testInfo.project.use, acceptDownloads: true })
  const other = await fresh.newPage()
  await openApp(other)
  await other.locator('nav button').nth(2).click()
  await other.locator('input[type=file]').first().setInputFiles({ name: 'sauvegarde.json', mimeType: 'application/json', buffer: fs.readFileSync(file) })
  await expect(other.locator('[role=status]')).toContainText('1 ticket à ajouter')
  await other.getByRole('button', { name: /Confirmer l'import/ }).click()
  await expect(other.locator('nav .badge')).toHaveText('1')
  await fresh.close()
})

test('import : aperçu, anomalies listées, rien d\'écrit avant confirmation', async ({ page }) => {
  await openApp(page)
  await openHistory(page)
  const item = { id: 'i', raw: 'LAIT', quantity: 1, unitPrice: 1.15, gross: 1.15, discount: 0, net: 1.15, coicop: '01.1.4' }
  const file = {
    type: 'backup',
    version: 1,
    tickets: [
      { id: 'ok', createdAt: '2024-03-12T10:00:00Z', store: 'Colruyt', date: '2024-03-12', items: [item] },
      { id: 'bad', createdAt: '2024-03-12T10:00:00Z', store: 'Lidl', date: '2024-03-12', items: [{ ...item, quantity: 'deux' }] },
    ],
    learned: [],
  }
  await page.locator('input[type=file]').first().setInputFiles({ name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  const preview = page.locator('[role=status]')
  await expect(preview).toContainText('1 ticket à ajouter · 1 rejeté(s)')
  await expect(preview).toContainText('quantity invalide')
  await expect(page.locator('nav .badge')).toHaveCount(0) // rien d'écrit
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(preview).toHaveCount(0)
  await expect(page.locator('nav .badge')).toHaveCount(0)
})

test('reclassement en masse : aperçu, rien d\'écrit avant confirmation, puis application', async ({ page }) => {
  await openApp(page)
  await openHistory(page)
  const old = { id: 'q', raw: 'QUICHE SAUMON BROC', normalized: 'Quiche saumon', quantity: 1, unitPrice: 3.5, gross: 3.5, discount: 0, net: 3.5, coicop: '01.1.1', coicopLabel: 'Céréales', category: 'Pain et céréales', confidence: 0.4, source: 'ia' }
  const file = { type: 'backup', version: 1, tickets: [{ id: 'old', createdAt: '2024-03-12T10:00:00Z', store: 'Proxy', date: '2024-03-12', items: [old] }], learned: [] }
  await page.locator('input[type=file]').first().setInputFiles({ name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await page.getByRole('button', { name: /Confirmer l'import/ }).click()
  await page.getByRole('button', { name: /Analyser les tickets/ }).click()
  const preview = page.getByTestId('reclass-preview')
  await expect(preview).toContainText('1 ligne(s) à reclasser dans 1 ticket(s)')
  await expect(preview).toContainText('01.1.1')
  await expect(preview).toContainText('01.1.9')
  // Décocher puis recocher : le bouton suit la sélection.
  await preview.getByRole('checkbox').uncheck()
  await expect(preview.getByRole('button', { name: /Appliquer \(0\)/ })).toBeDisabled()
  await preview.getByRole('checkbox').check()
  await preview.getByRole('button', { name: /Appliquer \(1\)/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'reclassée' })).toContainText('1 ligne(s) reclassée(s) dans 1 ticket(s)')
  await page.getByRole('button', { name: /Analyser les tickets/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Rien à reclasser' })).toBeVisible()
})

test('hors ligne : l\'application se recharge depuis le service worker', async ({ page, context }) => {
  await openApp(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'TicketScope BE' })).toBeVisible()
  await page.getByRole('button', { name: /Exemple/ }).click()
  await page.getByRole('button', { name: /Analyser le ticket/ }).click()
  await expect(page.getByRole('heading', { name: /Vérification/ })).toBeVisible()
  await context.setOffline(false)
})

test('la clé API est chiffrée au repos et retrouvée après rechargement', async ({ page }) => {
  const KEY = 'sk-ant-api03-E2E-SECRET-VALUE'
  await openApp(page)
  await page.getByRole('button', { name: 'Réglages' }).first().click()
  await page.locator('input[type=password]').fill(KEY)
  await expect(page.locator('.modal')).toContainText('Clé chiffrée sur cet appareil')
  await page.waitForTimeout(500) // fin de l'écriture asynchrone
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(stored).not.toContain('E2E-SECRET-VALUE')
  await page.reload()
  await page.getByRole('button', { name: 'Réglages' }).first().click()
  await expect(page.locator('input[type=password]')).toHaveValue(KEY)
})

test('les en-têtes de sécurité (CSP) sont servis', async ({ page }) => {
  const res = await page.goto('/')
  const csp = res.headers()['content-security-policy']
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain('connect-src')
})

test('aucun débordement horizontal de la page sur téléphone', async ({ page }) => {
  await saveSampleTicket(page)
  for (const index of [0, 1, 2]) {
    await page.locator('nav button').nth(index).click()
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `vue ${index}`).toBeLessThanOrEqual(0)
  }
})
