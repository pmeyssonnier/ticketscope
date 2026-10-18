import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

// Mise à jour d'une PWA déjà installée : une nouvelle version déployée doit être
// prise en compte (service worker + précache), sans perdre les données locales.
// On sert une copie de `dist/` que l'on modifie en cours de test pour simuler un
// déploiement.

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.gz': 'application/gzip' }

function serve(dir) {
  const server = http.createServer((req, res) => {
    let file = path.join(dir, decodeURIComponent(req.url.split('?')[0]))
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://localhost:${server.address().port}/` })))
}

// « Déploie » une version : marque index.html et change la révision de index.html
// dans le précache du service worker (comme le ferait un nouveau build).
function deploy(dir, version) {
  const indexPath = path.join(dir, 'index.html')
  let html = fs.readFileSync(indexPath, 'utf8').replace(/<meta name="e2e-build"[^>]*>/, '')
  html = html.replace('</head>', `<meta name="e2e-build" content="${version}"></head>`)
  fs.writeFileSync(indexPath, html)
  const swPath = path.join(dir, 'sw.js')
  const sw = fs.readFileSync(swPath, 'utf8')
  const next = sw.replace(/(url:"index\.html",revision:")[^"]*(")/, `$1e2e-rev-${version}$2`)
  expect(next, 'le précache de sw.js doit contenir index.html').toContain(`e2e-rev-${version}`)
  fs.writeFileSync(swPath, next)
}

const build = (page) => page.evaluate(() => document.querySelector('meta[name=e2e-build]')?.content ?? null)

test('une nouvelle version déployée est prise en compte, sans perte de données, hors ligne ensuite', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000)
  const dist = path.resolve('dist')
  test.skip(!fs.existsSync(dist), 'dist/ absent : lancer npm run build')
  const site = testInfo.outputPath('site')
  fs.cpSync(dist, site, { recursive: true })
  deploy(site, '1')
  const { server, url } = await serve(site)
  try {
    // Version 1 installée et utilisée : un ticket est enregistré.
    await page.goto(url)
    await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30_000 })
    await page.reload()
    expect(await build(page)).toBe('1')
    await page.getByRole('button', { name: /ticket d'exemple/ }).click()
    await page.getByRole('button', { name: /Enregistrer/ }).first().click()
    await expect(page.locator('nav .badge')).toHaveText('1')

    // Déploiement de la version 2, puis recherche de mise à jour par le navigateur.
    deploy(site, '2')
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())

    // Le nouveau service worker prend la main et la page passe en version 2.
    await page.waitForFunction(() => document.querySelector('meta[name=e2e-build]')?.content === '2', null, { timeout: 45_000 })
    await expect(page.locator('nav .badge')).toHaveText('1') // les données ont survécu

    // La version 2 fonctionne hors ligne (précache renouvelé).
    await context.setOffline(true)
    await page.reload()
    expect(await build(page)).toBe('2')
    await expect(page.getByRole('heading', { name: 'TicketScope BE' })).toBeVisible()
    await context.setOffline(false)
  } finally {
    server.close()
  }
})
