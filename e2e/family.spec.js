import { test, expect } from '@playwright/test'
import fs from 'node:fs'

// Parcours « famille » (par défaut) : photographier, vérifier l'essentiel, enregistrer, exporter.

async function openApp(page) {
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30_000 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'TicketScope BE' })).toBeVisible()
}

async function analyze(page) {
  await openApp(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  // Le texte collé n'existe qu'en mode avancé : en famille, on passe par le ticket d'exemple.
  await page.getByRole('button', { name: /ticket d'exemple/ }).click()
  await expect(page.getByRole('heading', { name: /Vérifiez votre ticket/ })).toBeVisible()
}

test('import : un seul geste (photographier), pas de réglages techniques', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('button', { name: /Photographier mon ticket/ })).toBeVisible()
  for (const hidden of [/OCR local/, /IA Claude/, /PDF/, /Texte/, /Améliorer l'image/]) {
    await expect(page.getByText(hidden)).toHaveCount(0)
  }
  await expect(page.locator('textarea')).toHaveCount(0)
})

test('vérification : total, puis seulement les articles à vérifier, sans code COICOP', async ({ page }) => {
  await analyze(page)
  await expect(page.locator('.banner')).toContainText('42 articles')
  await expect(page.locator('.banner')).toContainText('269,67')
  await expect(page.locator('.banner')).toContainText('cohérent')
  await expect(page.locator('.family')).not.toContainText(/\b\d\d\.\d\.\d\b/) // aucun code visible
  const flagged = await page.getByTestId('family-flagged').count()
  expect(flagged).toBeLessThan(42)
  // Les autres articles sont repliés.
  await expect(page.locator('.family-others')).toBeVisible()
})

test('un article à vérifier : choisir une catégorie courante, puis « C\'est bon »', async ({ page }) => {
  await openApp(page)
  page.on('dialog', (d) => d.accept()) // « aucune date renseignée »
  // Un ticket avec une ligne inconnue est créé en mode avancé (texte collé), puis on revient en famille.
  await page.getByRole('button', { name: 'Réglages' }).click()
  await page.getByRole('checkbox', { name: /Mode avancé/ }).check()
  await page.getByRole('button', { name: 'Fermer' }).last().click()
  await page.getByRole('textbox').first().fill('LAIT ENTIER 1L   1,15\nINCONNU XYZ TRUC   3,40\nTOTAL 4,55')
  await page.getByRole('button', { name: /Analyser le ticket/ }).click()
  await page.getByRole('button', { name: /Enregistrer/ }).first().click()
  await expect(page.locator('nav .badge')).toHaveText('1')
  await page.getByRole('button', { name: 'Réglages' }).click()
  await page.getByRole('checkbox', { name: /Mode avancé/ }).uncheck()
  await page.getByRole('button', { name: 'Fermer' }).last().click()

  await page.locator('nav button').nth(2).click()
  await page.getByTitle('Éditer ce ticket').click()
  await expect(page.getByRole('heading', { name: /Vérifiez votre ticket/ })).toBeVisible()
  const before = await page.getByTestId('family-flagged').count()
  expect(before).toBeGreaterThan(0)
  const card = page.getByTestId('family-flagged').filter({ hasText: 'INCONNU XYZ TRUC' })
  await expect(card.getByRole('button', { name: /C'est bon/ })).toBeDisabled() // pas de catégorie : pas de « C'est bon »
  await card.getByRole('button', { name: /Catégorie/ }).click()
  await page.getByRole('searchbox').fill('fromage')
  await page.getByRole('dialog').getByRole('button', { name: /Lait, fromages/ }).first().click()
  // Choisir une catégorie confirme la ligne : elle quitte la liste « à vérifier ».
  await expect(page.getByTestId('family-flagged')).toHaveCount(before - 1)

  // Une ligne déjà proposée (catégorie présente) se valide d'un tap sur « C'est bon ».
  const proposed = page.getByTestId('family-flagged').filter({ hasText: 'LAIT' })
  if (await proposed.count()) {
    await proposed.getByRole('button', { name: /C'est bon/ }).click()
    await expect(page.getByTestId('family-flagged')).toHaveCount(before - 2)
  }
})

test('enregistrer puis exporter un fichier Excel ou CSV, sans JSON ni sauvegarde', async ({ page }, testInfo) => {
  await analyze(page)
  await page.getByRole('button', { name: /Enregistrer/ }).click()
  await expect(page.locator('nav .badge')).toHaveText('1')
  await page.locator('nav button').nth(2).click()
  await expect(page.getByRole('heading', { name: /Envoyer mes dépenses/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /JSON/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Sauvegarder/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Analyser les tickets/ })).toHaveCount(0)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()])
  const file = testInfo.outputPath('depenses.csv')
  await download.saveAs(file)
  expect(fs.readFileSync(file, 'utf8')).toContain('coicop')
})

test('le mode avancé se règle dans les Réglages et rend les outils complets', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Réglages' }).click()
  await expect(page.getByText('Clé API Anthropic')).toHaveCount(0)
  await page.getByRole('checkbox', { name: /Mode avancé/ }).check()
  await expect(page.getByText('Clé API Anthropic')).toBeVisible()
  await page.getByRole('button', { name: 'Fermer' }).last().click()
  await expect(page.getByRole('button', { name: /PDF/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /PDF/ })).toBeVisible() // mémorisé
})

test('« Modifier en détail » ouvre l\'éditeur complet pour ce ticket', async ({ page }) => {
  await analyze(page)
  await page.getByRole('button', { name: /Modifier en détail/ }).click()
  await expect(page.getByRole('heading', { name: /Vérification & correction/ })).toBeVisible()
})

test('« Produits par catégorie » : retrouver un produit non classé et le corriger depuis l\'historique', async ({ page }) => {
  await openApp(page)
  page.on('dialog', (d) => d.accept()) // « aucune date renseignée »
  await page.getByRole('button', { name: 'Réglages' }).click()
  await page.getByRole('checkbox', { name: /Mode avancé/ }).check()
  await page.getByRole('button', { name: 'Fermer' }).last().click()
  await page.getByRole('textbox').first().fill('LAIT ENTIER 1L   1,15\nINCONNU XYZ TRUC   3,40\nTOTAL 4,55')
  await page.getByRole('button', { name: /Analyser le ticket/ }).click()
  await page.getByRole('button', { name: /Enregistrer/ }).first().click()
  await page.getByRole('button', { name: 'Réglages' }).click()
  await page.getByRole('checkbox', { name: /Mode avancé/ }).uncheck()
  await page.getByRole('button', { name: 'Fermer' }).last().click()

  await page.locator('nav button').nth(2).click()
  const block = page.getByTestId('products-by-category')
  await expect(block).toContainText('1 non classé')
  await block.getByRole('button', { name: /Produits par catégorie/ }).click()
  const group = block.getByTestId('pbc-group').first()
  await expect(group).toContainText('Non classé')
  await expect(group).toContainText('INCONNU XYZ TRUC')
  // Les autres catégories ont un nom lisible (emoji + libellé simple), pas de caractère cassé.
  const names = await block.getByTestId('pbc-group').locator('.pbc-head b').allTextContents()
  expect(names.length).toBeGreaterThan(1)
  for (const n of names) {
    expect(n).not.toContain('\uFFFD')
    expect(n.trim().length).toBeGreaterThan(3)
  }
  expect(names.join(' ')).toContain('Lait, fromages')
  await group.getByRole('button', { name: /Catégorie de/ }).click()
  await page.getByRole('searchbox').fill('fromage')
  await page.getByRole('dialog').getByRole('button', { name: /Lait, fromages/ }).first().click()
  await expect(block).toContainText('1 ligne(s) classée(s)')
  await expect(block).toContainText('tout est classé')
})
