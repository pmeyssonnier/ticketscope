import { test, expect } from '@playwright/test'
import path from 'node:path'

// Écran de correction : fiches sur téléphone, tableau sur grand écran, barre
// d'écart collante, confiance de lecture (OCR réel) distincte du classement.

// Ces scénarios testent l'interface complète : on active le mode avancé.
async function openApp(page) {
  await page.addInitScript(() => localStorage.setItem('ticketscope.advanced', '1'))
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30_000 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'TicketScope BE' })).toBeVisible()
}

async function analyzeSample(page, { detail = true } = {}) {
  await openApp(page)
  await page.getByRole('button', { name: /Exemple/ }).click()
  await page.getByRole('button', { name: /Analyser le ticket/ }).click()
  await expect(page.getByRole('heading', { name: /Vérification/ })).toBeVisible()
  // Le ticket d'exemple a 42 lignes : l'écran s'ouvre en mode simplifié.
  if (detail) await page.getByRole('tab', { name: 'Détaillé' }).click()
}

test.describe('téléphone', () => {
  test('les lignes sont des fiches, sans défilement horizontal', async ({ page }) => {
    await analyzeSample(page)
    await expect(page.getByTestId('review-card')).toHaveCount(42)
    await expect(page.locator('table.data')).toHaveCount(0)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('la barre d\'écart reste visible au-dessus de la navigation et réagit aux saisies', async ({ page }) => {
    await analyzeSample(page)
    const bar = page.getByTestId('review-bar')
    await expect(bar).toContainText('Total cohérent')
    await expect(bar).toContainText('269,67')

    // Modifier une quantité crée un écart visible immédiatement.
    await page.getByTestId('review-card').first().locator('input[type=number]').first().fill('5')
    await expect(bar).toContainText('Écart +25,60')

    // Elle reste à l'écran quand on descend dans la liste, au-dessus de la navigation.
    await page.getByTestId('review-card').nth(30).scrollIntoViewIfNeeded()
    const box = await bar.boundingBox()
    const nav = await page.locator('nav.nav').boundingBox()
    expect(box.y).toBeGreaterThan(0)
    expect(box.y + box.height).toBeLessThanOrEqual(nav.y + 1)

    // Remettre la bonne valeur referme l'écart.
    await page.getByTestId('review-card').first().locator('input[type=number]').first().fill('4')
    await expect(bar).toContainText('Total cohérent')
  })

  test('on enregistre depuis la barre, sans descendre en bas de la liste', async ({ page }) => {
    await analyzeSample(page)
    await page.getByTestId('review-bar').getByRole('button', { name: /Enregistrer/ }).click()
    await expect(page.locator('nav .badge')).toHaveText('1')
  })

  test('les lignes à confirmer se filtrent depuis la barre', async ({ page }) => {
    await openApp(page)
    await page.getByRole('textbox').first().fill('26 DASH PODS PL. C   25,60\nINCONNU XYZ TRUC   3,40\nTOTAL 28,00') // 2e ligne : non classée
    await page.getByRole('button', { name: /Analyser le ticket/ }).click()
    const chip = page.getByTestId('review-bar').getByRole('button', { name: /à confirmer/ })
    await expect(chip).toContainText('1 à confirmer')
    await chip.click()
    await expect(page.getByTestId('review-card')).toHaveCount(1)
    await expect(chip).toContainText('tout afficher')
  })

  test('OCR local : confiance de lecture et de classement affichées séparément', async ({ page }) => {
    test.setTimeout(120_000)
    await openApp(page)
    await page.locator('input[type=file]').first().setInputFiles(path.join(import.meta.dirname, 'fixtures', 'ticket-synthetique.png'))
    await page.getByRole('button', { name: /Lire la photo/ }).click()
    await expect(page.getByRole('heading', { name: /Vérification/ })).toBeVisible({ timeout: 90_000 })
    await page.getByRole('tab', { name: 'Détaillé' }).click()
    const foot = page.getByTestId('review-card').first().locator('.rcard-foot')
    await expect(foot).toContainText(/Lecture \d+\s?%/)
    await expect(foot).toContainText(/Classement \d+\s?%/)
  })
})

test.describe('longs tickets : mode simplifié, contrôle des codes, recherche de classe', () => {
  test('au-delà de 10 lignes, l\'écran s\'ouvre en liste simplifiée, une ligne par article', async ({ page }) => {
    await analyzeSample(page, { detail: false })
    await expect(page.getByRole('tab', { name: 'Simplifié' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.crow')).toHaveCount(42)
    await expect(page.getByTestId('review-card')).toHaveCount(0)
    // Un tap ouvre la fiche complète de cette ligne seulement.
    await page.locator('.crow-main').first().click()
    await expect(page.getByTestId('review-card')).toHaveCount(1)
  })

  test('un ticket court s\'ouvre en mode détaillé', async ({ page }) => {
    await openApp(page)
    await page.getByRole('textbox').first().fill('26 DASH PODS PL. C   25,60\nTOTAL 25,60')
    await page.getByRole('button', { name: /Analyser le ticket/ }).click()
    await expect(page.getByRole('tab', { name: 'Détaillé' })).toHaveAttribute('aria-selected', 'true')
  })

  test('la recherche retrouve une classe par mot-clé et la lui attribue', async ({ page }) => {
    await openApp(page)
    await page.getByRole('textbox').first().fill('INCONNU XYZ TRUC   3,40\nTOTAL 3,40')
    await page.getByRole('button', { name: /Analyser le ticket/ }).click()
    await page.getByRole('button', { name: /Code COICOP/ }).first().click()
    await page.getByRole('searchbox').fill('bonde')
    await page.getByRole('button', { name: /04\.3\.1/ }).click()
    await expect(page.getByRole('button', { name: /Code COICOP : 04\.3\.1/ })).toBeVisible()
  })

  test('le contrôle des codes regroupe par code et reclasse plusieurs lignes d\'un coup', async ({ page }) => {
    await analyzeSample(page, { detail: false })
    await page.getByRole('tab', { name: 'Contrôle des codes' }).click()
    const before = await page.getByTestId('code-group').count()
    expect(before).toBeGreaterThan(3)
    await page.getByTestId('code-group').first().getByRole('checkbox').first().check()
    await page.getByRole('region', { name: 'Reclassement groupé' }).getByRole('button', { name: /Classer la sélection en/ }).click()
    await page.getByRole('searchbox').fill('04.3.1')
    await page.getByRole('button', { name: /04\.3\.1/ }).click()
    await expect(page.getByTestId('code-group').filter({ hasText: '04.3.1' })).toHaveCount(1)
  })
})

test.describe('grand écran', () => {
  test.use({ viewport: { width: 1100, height: 800 }, isMobile: false, hasTouch: false })

  test('le tableau est conservé (pas de fiches ni de barre collante)', async ({ page }) => {
    await analyzeSample(page)
    await expect(page.locator('table.data')).toHaveCount(1)
    await expect(page.getByTestId('review-card')).toHaveCount(0)
    await expect(page.getByTestId('review-bar')).toHaveCount(0)
    await expect(page.locator('.banner')).toContainText('cohérent')
  })
})
