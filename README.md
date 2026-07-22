# TicketScope BE

Application web (PWA) d'analyse de tickets de caisse pour le marché belge :
importez un ticket, l'application **extrait les produits, les normalise, leur
attribue un code COICOP** avec un taux de confiance, puis produit des
**tableaux de bord** de dépenses et des **exports Excel / CSV / JSON**.

Cette version **V1** est entièrement **côté client** : tout le traitement se
fait dans le navigateur, aucune donnée ne quitte l'appareil, et l'application
fonctionne **hors connexion** une fois installée.

| Import | Correction & COICOP | Tableau de bord |
|:---:|:---:|:---:|
| ![Import](docs/01-import.png) | ![Correction](docs/02-review.png) | ![Tableau de bord](docs/03-dashboard.png) |

## Fonctionnalités (V1)

- 📷 **Import** d'un ticket par copier-coller ou fichier `.txt` (OCR photo/PDF prévu en V2).
- 🧠 **Extraction & normalisation** : détection de l'enseigne, de la date, des
  produits, quantités, prix unitaires et promotions.
  - regroupe les lignes identiques (`4 × 25,60`) ;
  - rattache les remises à l'article (`-51,20` → net recalculé) ;
  - ne compte pas deux fois les remises du récapitulatif.
- 🏷️ **Classification COICOP** avec **taux de confiance** et catégorie fine,
  à partir d'une base de connaissances produits.
- ✏️ **Écran de correction** : produit, quantité, prix, code COICOP, catégorie.
  Chaque correction **enrichit la base** (auto-apprentissage local).
- 🔎 **Contrôle de cohérence** : total recalculé vs total payé du ticket.
- 📊 **Tableaux de bord** : dépenses par division COICOP, par catégorie, par
  magasin, évolution mensuelle, top produits, économies réalisées.
- 🗂️ **Historique** avec recherche instantanée (produit, catégorie, COICOP, magasin).
- ⬇️ **Exports** Excel (`.xlsx`, feuilles *Lignes* / *Synthèse COICOP* /
  *Tickets*), CSV et JSON — prêts pour Excel ou Power BI.
- 📱 **PWA** installable sur Android, iPhone, Windows, Mac ; fonctionne hors ligne.

## Démarrage

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173)
npm run build      # build de production dans dist/
npm run preview    # sert le build de production
npm test           # tests unitaires (parseur + classification)
```

Pour l'essayer immédiatement : ouvrez l'application, cliquez sur
**« Charger un ticket d'exemple »**, puis **« Analyser le ticket »**.

## Architecture

```
src/
  data/
    coicop.js        Référentiel des codes COICOP (libellés, divisions)
    dictionary.js    Base de connaissances produits (libellés bruts → COICOP)
    sampleTicket.js  Ticket de démonstration
  lib/
    format.js        Normalisation de texte, parsing des montants, formats € / dates
    parser.js        Texte du ticket → enseigne, date, lignes, totaux
    classifier.js    Ligne → produit normalisé + COICOP + confiance
    storage.js       Persistance locale (tickets + base apprise)
    exporters.js     Exports Excel / CSV / JSON
    parser.test.js   Tests unitaires
  components/        Interface React (Import, Correction, Tableau de bord, Historique)
```

Le **parseur est découplé de la source d'entrée** : brancher un OCR (photo/PDF)
en V2 revient à fournir du texte à `parseTicket()`.

### Base de connaissances & COICOP

La base produits (`src/data/dictionary.js`) et le référentiel COICOP
(`src/data/coicop.js`) sont dérivés du jeu de référence
`ticket_proxy_coicop.xlsx`. Chaque entrée relie des **libellés bruts** (souvent
abrégés sur les tickets) à un **produit normalisé**, une **marque**, un **code
COICOP** et une **catégorie**. Les corrections de l'utilisateur ajoutent des
entrées apprises, stockées localement, prioritaires lors des classifications
suivantes.

## Vie privée

Aucune donnée personnelle n'est transmise : tickets, produits et corrections
sont conservés uniquement dans le stockage local du navigateur (`localStorage`).

## Feuille de route

- **V1 (cette version)** — import texte, extraction, classification COICOP,
  correction, tableaux de bord, exports, PWA hors-ligne.
- **V2** — OCR photo/PDF, apprentissage automatique, comparateur de prix entre
  enseignes, synchronisation cloud.
- **V3** — scan de codes-barres (EAN), intégration bancaire, listes de courses,
  alertes prix, suivi nutritionnel et empreinte carbone, *Data Explorer* façon
  Power BI (tableaux croisés, requêtes en langage naturel).
