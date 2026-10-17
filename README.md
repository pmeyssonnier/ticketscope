# TicketScope BE

Application web (PWA) d'analyse de tickets de caisse pour le marché belge :
importez un ticket, l'application **extrait les produits, les normalise, leur
attribue un code COICOP** avec un taux de confiance, puis produit des
**tableaux de bord** de dépenses et des **exports Excel / CSV / JSON**.

L'application est entièrement **côté client** (aucun backend) : le traitement se
fait dans le navigateur, les données restent sur l'appareil et l'application
fonctionne **hors connexion** une fois installée. Seule exception, le mode ✨ IA
en option, qui envoie l'image du ticket à l'API Anthropic (voir plus bas).

| Import | Correction & COICOP | Tableau de bord |
|:---:|:---:|:---:|
| ![Import](docs/01-import.png) | ![Correction](docs/02-review.png) | ![Tableau de bord](docs/03-dashboard.png) |

## Fonctionnalités

### Import
- 📷 **Photo (OCR)**, **PDF**, fichier `.txt` ou **copier-coller**. L'OCR image
  (Tesseract.js) et la lecture PDF (pdf.js) tournent **entièrement dans le
  navigateur** : aucune image n'est envoyée sur Internet. Les PDF « numériques »
  sont lus via leur texte intégré ; les PDF scannés passent par l'OCR.
- 🧵 **Multi-photo** pour les longs tickets : photographiez le ticket en
  plusieurs tranches (du haut vers le bas, avec un léger recouvrement). Chaque
  tranche est lue puis **recollée automatiquement**, sans dupliquer les lignes
  du recouvrement (`src/lib/stitch.js`).
- ✨ **Pré-traitement d'image** avant l'OCR (activable) : orientation EXIF,
  redimensionnement, niveaux de gris, suppression des ombres, contraste,
  débruitage et redressement (deskew). Un aperçu montre l'image « telle que vue
  par l'OCR ».
- ✨ **Mode IA (Claude Vision)**, en option — voir la section dédiée plus bas.

### Extraction et classification
- 🧠 **Extraction et normalisation** : enseigne, date (dates impossibles
  rejetées), produits, quantités (`4 × 25,60`, `2 x 1,50   3,00`), prix
  unitaires, promotions et remises rattachées à l'article ; les remises du
  récapitulatif ne sont pas comptées deux fois.
- 🏷️ **Classification COICOP** avec **taux de confiance** et catégorie fine :
  alimentation et boissons (01-02), **habillement et chaussures (03)** et
  produits d'entretien (05), à partir d'une base de connaissances produits et
  de règles de suggestion par mot-clé.
- 📏 **Format et prix unitaire normalisé** (€/kg, €/L, €/pièce), multipacks
  compris (`6 x 33 cl`).
- ✏️ **Écran de correction** : produit, quantité, prix, remise, format, code
  COICOP, catégorie. Chaque correction **enrichit la base** (auto-apprentissage
  local). Les lignes « à confirmer » se filtrent d'un clic ; on peut ajouter une
  ligne manquante à la main. **Sur téléphone**, les lignes sont des **fiches**
  (champs étiquetés, sans défilement horizontal) et une **barre collante** au-dessus
  de la navigation affiche en permanence l'écart entre le total du ticket et le
  total recalculé, le nombre de lignes à confirmer et le bouton Enregistrer ; sur
  grand écran, le tableau est conservé.
- 🎯 **Deux confiances distinctes** par ligne : **lecture** (le libellé et les
  montants ont-ils été bien lus ? score par ligne de l'OCR Tesseract, ou
  certitude de l'IA) et **classement** (bon code COICOP ?). Une ligne est « à
  confirmer » si l'une des deux est faible ; modifier la ligne ou toucher
  « Lecture vérifiée » confirme la lecture. Un texte collé ou un PDF numérique n'a
  pas de score de lecture (texte exact).
- 🔎 **Contrôle de cohérence** : total recalculé vs total payé du ticket.

### Suivi et exports
- 📊 **Tableaux de bord** : dépenses par division COICOP, par catégorie, par
  magasin, évolution mensuelle, top produits, économies réalisées. Le tableau de
  bord est chargé à la demande pour garder un démarrage rapide.
- 🗂️ **Historique** : recherche instantanée (produit, catégorie, COICOP,
  magasin), **modification** d'un ticket enregistré et **comparaison de deux
  tickets** (par exemple le même ticket lu par l'IA et par l'OCR), avec
  correction directement dans la comparaison.
- ⬇️ **Exports** Excel (`.xlsx`, feuilles *Lignes* / *Synthèse COICOP* /
  *Tickets*), CSV et JSON, prêts pour Excel ou Power BI.
- 💾 **Sauvegarde complète** (tickets + dictionnaire appris, jamais la clé API)
  en un fichier `.json`, à restaurer sur un autre appareil. L'import est **strict
  et en deux temps** : le fichier est d'abord analysé (aperçu avec les anomalies,
  rien n'est écrit), puis importé seulement après votre confirmation. Les valeurs
  impossibles (texte dans un champ numérique, date inexistante, quantité
  négative…) font **rejeter** le ticket au lieu d'être corrigées en silence ; les
  tickets déjà présents ne sont jamais écrasés ; les anciens exports JSON des
  tickets et l'export du dictionnaire sont acceptés. Un **rappel** s'affiche
  quand aucune sauvegarde n'a été exportée depuis 30 jours (les sauvegardes
  restent manuelles).

  ![Sauvegarde complète](docs/06-backup.png)
- 📱 **PWA** installable sur Android, iPhone, Windows, Mac ; fonctionne hors
  ligne (portrait et paysage).

## Mode IA (Claude Vision)

Au lieu de l'OCR local, la photo (ou le PDF) est lue par **Claude**, qui extrait,
normalise et classe les produits en un seul appel, avec une réponse JSON
structurée. C'est nettement plus précis sur les photos difficiles.

- **Modèles** (Réglages ⚙) : **Haiku 4.5** par défaut (rapide, économique),
  Haiku 5.5, Sonnet 5 et Sonnet 5.5 en option. Haiku 5.5 et Sonnet 5.5 sont
  encore à valider sur de vrais tickets.
- **BYOK** : vous utilisez **votre propre clé API Anthropic** (créez-la sur
  console.anthropic.com, avec une limite de dépense). Elle est **chiffrée sur
  l'appareil** (voir *Vie privée et sécurité*) et n'est envoyée qu'à l'API
  Anthropic.
- **Vie privée** : en mode IA, l'image du ticket **quitte l'appareil**. L'OCR
  local reste le mode par défaut, 100 % hors ligne.
- **Promotions de lot** (`Boxers 3 x 19,99EUR = -3,98`) : gardées comme **une
  ligne négative** dans la liste, avec le code COICOP des articles concernés,
  pour que le total reste exact. Une remise supérieure au prix de la ligne est
  marquée « à confirmer ».
- **Erreurs** : délai de 90 s, nouvelles tentatives sur 429/529, messages
  explicites (clé invalide, limite de débit, ticket trop long, lecture vide avec
  le détail de la réponse de l'API).

## Démarrage

Prérequis : **Node.js 24.x** (champ `engines` de `package.json`).

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173)
npm run build      # build de production dans dist/
npm run preview    # sert le build de production
npm test           # tests unitaires (Vitest)
npm run e2e        # tests de bout en bout sur téléphone émulé (Playwright)
npm run eval       # précision du pipeline local sur un jeu de tickets annotés
```

Les tests de bout en bout construisent l'application, la servent avec les en-têtes
de `vercel.json` et la pilotent dans Chromium (Pixel 7). Premier lancement :
`npx playwright install chromium` ; `PW_CHROMIUM=/chemin/vers/chrome` permet
d'utiliser un Chromium déjà installé.

Pour l'essayer immédiatement : ouvrez l'application, cliquez sur
**« Exemple »**, puis **« Analyser le ticket »**.

## Déploiement (Vercel)

Le dépôt est prêt pour **Vercel** (config dans `vercel.json`) — aucun réglage
manuel à saisir :

1. Sur [vercel.com](https://vercel.com) → **Add New… → Project**.
2. **Import Git Repository** → choisissez ce dépôt GitHub.
3. Vercel détecte le framework **Vite** et lit `vercel.json` :
   - *Build Command* : `npm run build` (copie les fichiers OCR puis build Vite) ;
   - *Output Directory* : `dist` ;
   - réécriture SPA (`/* → /index.html`) et cache correct du *service worker* ;
   - en-têtes de sécurité, dont une **Content-Security-Policy** (scripts de
     l'application uniquement ; connexions limitées à l'application et à
     `api.anthropic.com`).
4. **Version de Node** : celle de `engines` (24.x). Vercel a abandonné Node 20 ;
   si le build échoue sur ce point, vérifiez aussi *Settings → General → Node.js
   Version*.
5. **Branche de production** : choisissez la branche à déployer (*Settings →
   Git → Production Branch*). Chaque push sur une autre branche produit un
   déploiement de prévisualisation.

> Le mode ✨ IA est **BYOK** : la clé API reste sur l'appareil de l'utilisateur
> (aucune variable d'environnement à configurer sur Vercel).

L'intégration continue (`.github/workflows/ci.yml`) lance, à chaque push et pull
request, les tests unitaires et le build, ainsi que les tests de bout en bout
(rapport Playwright conservé en cas d'échec).

## Architecture

```
src/
  App.jsx            Navigation, état global (tickets, réglages IA, clé API en mémoire)
  data/
    coicop.js        Référentiel des codes COICOP (libellés, divisions)
    dictionary.js    Base de connaissances produits (libellés bruts → COICOP)
    sampleTicket.js  Ticket de démonstration
  lib/
    format.js        Normalisation de texte, parsing des montants, formats € / dates
    parser.js        Texte du ticket → enseigne, date, lignes, totaux
    classifier.js    Ligne → produit normalisé + COICOP + confiance (tolérant aux fautes OCR)
    suggest.js       Suggestion COICOP à partir du nom saisi (dictionnaire + règles)
    units.js         Format (poids, volume, pièces, multipacks) et prix unitaire
    imagePrep.js     Pré-traitement image (ombres, contraste, deskew) avant OCR
    ocr.js           OCR image (Tesseract.js) + lecture PDF (pdf.js) → texte
    stitch.js        Recollage de plusieurs photos d'un long ticket
    claudeVision.js  Mode IA : lecture par Claude (vision) → JSON structuré → brouillon
    compare.js       Comparaison de deux tickets (appariement flou des lignes)
    ticketStore.js   Tickets enregistrés (IndexedDB, repli localStorage, migration)
    secretStore.js   Clé API Anthropic chiffrée (WebCrypto, clé d'appareil non exportable)
    storage.js       Base apprise et réglages (localStorage)
    review.js        Logique pure de l'écran de correction (à confirmer, totaux, écart)
    readConfidence.js Confiance de lecture par ligne (scores OCR rattachés aux lignes)
    useMediaQuery.js Hook : fiches (téléphone) ou tableau (grand écran)
    backup.js        Sauvegarde / restauration : validation stricte, plan d'import, rappel
    saveFlow.js      Enregistrement d'un ticket corrigé : ticket d'abord, apprentissage ensuite
    exporters.js     Exports Excel / CSV / JSON
    xlsxWriter.js    Écriture .xlsx maison (sans dépendance de lecture)
    *.test.js        Tests unitaires de chaque module
  components/        Interface React (Import, Correction — tableau et fiches —,
                     Tableau de bord, Historique, Comparaison, Réglages)
e2e/                 Tests de bout en bout (Playwright, téléphone émulé)
eval/                Jeu de tickets annotés et suivi de précision (npm run eval)
playwright.config.js Configuration des tests de bout en bout
scripts/
  prepare-ocr.mjs    Copie le moteur Tesseract (worker + WASM) dans public/tesseract/
public/tesseract/    Actifs OCR servis localement (aucun CDN) ; lang/ = modèle FR
```

Le **parseur est découplé de la source d'entrée** (`ocr.js` → texte →
`parseTicket()`), ce qui permet d'ajouter d'autres sources sans toucher au reste ;
le mode IA produit directement le même brouillon que l'écran de correction.

### OCR & lecture PDF (100 % local)

- **Images** : `Tesseract.js` (WebAssembly). Le worker et le cœur WASM sont
  copiés depuis `node_modules` par `scripts/prepare-ocr.mjs` (lancé avant
  `dev`/`build`) et servis depuis `public/tesseract/`. Le modèle français
  `lang/fra.traineddata.gz` est versionné dans le dépôt.
- **Pré-traitement** (`imagePrep.js`) : orientation EXIF, éclairage/ombres via
  division par le fond, contraste, débruitage, redressement. Désactivable via
  une case à cocher.
- **PDF** : `pdf.js` lit d'abord le texte intégré (PDF numérique) ; si la page
  est scannée, elle est rendue en image, pré-traitée, puis passée à l'OCR.
- **Multi-photo** (`stitch.js`) : chaque photo est lue séparément, puis les
  textes sont recollés en détectant les lignes communes au recouvrement
  (similarité de Dice sur bigrammes).
- Le service worker met ces actifs en cache à la première utilisation
  (`runtimeCaching`), de sorte que l'OCR fonctionne ensuite **hors connexion**.

![Capture multi-photo d'un long ticket](docs/05-multiphoto.png)

### Base de connaissances & COICOP

La base produits (`src/data/dictionary.js`) et le référentiel COICOP
(`src/data/coicop.js`) sont dérivés du jeu de référence
`ticket_proxy_coicop.xlsx`. Chaque entrée relie des **libellés bruts** (souvent
abrégés sur les tickets) à un **produit normalisé**, une **marque**, un **code
COICOP** et une **catégorie**. Les corrections de l'utilisateur ajoutent des
entrées apprises, stockées localement, prioritaires lors des classifications
suivantes. En mode IA, la liste des codes COICOP du référentiel est imposée au
modèle (le schéma JSON de la réponse l'énumère).

### Suivi de précision (`npm run eval`)

`eval/` contient un jeu de tickets annotés et un script qui mesure ce que le
pipeline **local** fait d'un texte de ticket, avec 0 / 3 / 6 % de bruit de type
OCR : lignes retrouvées, montants exacts, bon code COICOP, couverture, erreurs
signalées « à confirmer » et **calibration de la confiance**. `npm test` rejoue ces
mesures avec des seuils (« cliquet ») : une régression fait échouer les tests.
Mesures : lignes et montants retrouvés à 100 % (jusqu'à 6 % de bruit) ;
sur le ticket d'exemple, 96 % d'accord avec les codes de l'IA. Avant le **repli par
règles**, le dictionnaire local ne classait aucune ligne d'un ticket d'habillement
synthétique et 13 % d'un ticket de courses synthétique ; avec le repli, la
couverture passe à 100 % et 93 % (98 % au global) pour 94 % de bons codes. Les
codes de référence du ticket d'exemple viennent de l'IA et **ne sont pas validés
par un humain** (voir `eval/README.md`).

## Vie privée et sécurité

- **Aucun serveur** : tickets, produits et corrections restent dans le
  navigateur de l'appareil. L'OCR local n'envoie rien sur Internet ; seul le
  mode IA envoie l'image du ticket à l'API Anthropic.
- **Stockage** : les tickets sont dans **IndexedDB** (migrés automatiquement
  depuis l'ancien `localStorage`, avec repli sur `localStorage` si IndexedDB est
  indisponible). La migration est **idempotente** : elle n'écrase jamais un ticket
  déjà présent et ne ressuscite pas un ticket supprimé, même si l'ancienne clé n'a
  pas pu être effacée. La base apprise et les réglages sont dans `localStorage`.
- **Clé API Anthropic** : chiffrée (AES-GCM) avec une **clé d'appareil non
  exportable** (WebCrypto), dans une base IndexedDB à part ; migrée
  automatiquement depuis l'ancien stockage en clair — l'ancienne copie n'est
  supprimée qu'après avoir été chiffrée **et relue**. Elle n'apparaît jamais dans
  les sauvegardes. **Mode dégradé** (sans WebCrypto ou IndexedDB, ou stockage
  plein) : la clé n'est **jamais écrite en clair** ; elle reste en mémoire pour la
  session, les Réglages l'indiquent et il faudra la ressaisir. Limite : un script
  malveillant exécuté dans la page pourrait demander le déchiffrement ; la CSP
  réduit ce risque sans l'éliminer.
- **Exports** : les libellés commençant par `=`, `+`, `-` ou `@` sont neutralisés
  pour éviter l'injection de formule à l'ouverture dans Excel.
- **Dépendances** : l'export Excel n'utilise plus la librairie `xlsx` (avis de
  sécurité sans correctif sur npm) mais un écrivain `.xlsx` maison
  (`xlsxWriter.js`, compression `fflate`). Les outils de développement (Vite 7,
  Vitest 5, plugins PWA et React à jour) sont aussi à jour : `npm audit` ne
  signale aucune vulnérabilité, y compris pour les dépendances de développement.
- **Instructions au modèle IA** : l'invariant de total est
  somme(lignes) + somme(promotions) = total payé ; les remises globales du
  récapitulatif passent par les promotions au lieu d'être ignorées.

## Nouveautés récentes

- **2.9.1** — la feuille *Synthèse COICOP* de l'export Excel est regroupée **par code**
  (une ligne par code ; les catégories distinctes sont réunies avec « / »).
- **2.9** — **repli par règles** pour le classement local : un produit absent du
  dictionnaire est classé par les règles génériques (vêtements, chaussures,
  alimentation…), toujours « à confirmer » (confiance 60 % ou 50 %, mention
  « 💡 par règle ») ; le dictionnaire et les corrections apprises restent
  prioritaires.
- **2.8** — écran de correction en **fiches sur téléphone** avec barre d'écart
  collante ; **confiance de lecture** séparée de la confiance de classement
  (OCR, IA, export, sauvegarde) ; **suivi de précision** sur un jeu annoté
  (`npm run eval`) ; tests de bout en bout des fiches et de la **mise à jour du
  service worker** ; lacets et semelles suggèrent les chaussures.
- **2.7.1** — corrections issues de la revue de code : migration des tickets
  idempotente ; clé API jamais écrite en clair (mode dégradé en mémoire, erreurs
  signalées, ancienne clé supprimée seulement après confirmation) ; import des
  sauvegardes strict avec aperçu et confirmation ; consigne de total cohérente avec
  les promotions ; vrac « au litre » en volume ; ticket enregistré avant
  l'apprentissage ; rappel de sauvegarde ; tests de bout en bout sur téléphone en
  CI ; outils de développement à jour (0 vulnérabilité) ; captures d'écran
  régénérées.
- **2.7** — sauvegarde / restauration complète ; export Excel sans la dépendance
  `xlsx` vulnérable.
- **2.6** — Node 24 ; tickets dans IndexedDB ; clé API chiffrée ; codes COICOP
  habillement ; promotions de lot en ligne négative ; correctifs du parseur et
  des formats ; chargement à la demande du tableau de bord ; CSP et intégration
  continue.

## Feuille de route

- **V1** — import texte, extraction, classification COICOP, correction,
  tableaux de bord, exports, PWA hors-ligne.
- **V2 (version actuelle)** — import **photo (OCR) / PDF**, pré-traitement
  d'image, capture multi-photo, **mode IA (Claude Vision)**, comparaison de
  tickets, prix unitaires, sauvegarde complète.
- **V3** — apprentissage automatique avancé, comparateur de prix entre
  enseignes, synchronisation cloud, modèles OCR multilingues, scan de
  codes-barres (EAN), intégration bancaire, listes de courses, alertes prix,
  suivi nutritionnel et empreinte carbone, *Data Explorer* façon Power BI
  (tableaux croisés, requêtes en langage naturel).
