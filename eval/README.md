# Suivi de précision

`npm run eval` mesure ce que le pipeline **local** de TicketScope (texte → lignes →
COICOP) fait d'un ticket, sur un jeu de tickets annotés (`dataset.json`), avec ou
sans bruit OCR. `npm test` rejoue les mêmes mesures avec des seuils (« cliquet ») :
une baisse fait échouer le test. Depuis le repli par règles, la tranche « < 75 % »
est souvent juste sans bruit (≈ 92 %) : elle reste signalée « à confirmer » et ne
devient peu fiable qu'avec du bruit OCR (≈ 53 % à 6 %). Après une amélioration, **remontez les seuils** de
`eval.test.js`.

## Indicateurs

| Indicateur | Sens |
|---|---|
| lignes retrouvées / précision | lignes attendues retrouvées ; lignes produites qui correspondent |
| net exact | montant net identique à l'attendu (quantités, remises) |
| COICOP exact | bon code, parmi les lignes attendues qui ont un code de référence |
| couverture | part des lignes qui reçoivent un code (sinon : à classer à la main) |
| erreurs signalées | parmi les codes faux, part marquée « à confirmer » |
| total cohérent | total recalculé = total du ticket |
| calibration | part de bons codes par tranche de confiance (≥ 85 %, 75–85 %, < 75 %) |

Bruit OCR : à 3 % / 6 %, chaque lettre d'un libellé a cette probabilité d'être
confondue (I↔l, O→0…), perdue ou doublée, avec une graine fixe (résultats
reproductibles). Les montants ne sont pas altérés. Ce n'est pas un test de l'OCR
lui-même (pas d'image) ; la confiance de lecture par ligne (Tesseract / IA) est
affichée dans l'application.

## Fiabilité de la référence : lisez `provenance`

- `proxy-ocr` : libellés d'un OCR réel ; codes proposés par le **mode IA** (gardés
  si la confiance IA ≥ 75 %), **non validés par un humain**. L'indicateur mesure
  donc l'accord avec l'IA, pas la justesse absolue.
- `vetements-synthetique`, `courses-synthetique` : tickets inventés, annotés à la
  main avec les codes du référentiel du projet.

Pour une vraie référence : relire les codes d'un ticket dans l'écran de correction,
exporter, puis remplacer les `coicop` du jeu par les codes validés.

## Ajouter un ticket

Ajouter un objet à `tickets` : `id`, `provenance`, `store`, `date` (`jj/mm/aaaa`),
`declaredTotal`, et `items` (`raw`, `quantity`, `unitPrice`, `discount`, `net`,
`coicop` ou `null` si la référence est incertaine). Ne pas y mettre de ticket
personnel : le jeu est versionné.

## Codes de référence : COICOP 2018

Les codes du jeu annoté suivent la COICOP **2018** officielle (`src/data/coicop2018.js`).
Trois lignes ont été recodées après confrontation à la source : « BUNDA GING BE »
`02.1.2` → `01.2.6` (soda ; `02.1.2` est le vin), « JUS ORANGE 1L » `02.1.2` →
`01.2.1`, « CAFE MOULU 250G » `01.1.9` → `01.2.2` (mon annotation initiale était
fausse). « SAUCE TOMATE » reste `01.1.9` (sauces et condiments, `01.1.9.3`).
« MCCAIN AIRFRY » reste en désaccord (dictionnaire `01.1.9`, référence `01.1.7`) :
la structure officielle ne tranche pas les frites surgelées, à valider.

## Tickets des classes ajoutées (2.9.9)

`pharmacie-soins-synthetique` (06.1.x, 13.1.2) et `maison-auto-resto-synthetique` (05.x,
07.2.2, 11.1.x, 13.1.3) sont annotés **par l'auteur des règles** : ils vérifient que chaque
classe est atteignable et sans faux positif évident, pas qu'elle est juste sur de vrais
tickets. Un vrai ticket n'a qu'un commerce ; ici les lignes sont mélangées pour couvrir les
classes. À remplacer par des tickets réels dès qu'on en a.

## Recodage du 2026-10-18 (2.9.12)

Deux lignes de `proxy-ocr` ont été recodées d'après le texte officiel de la COICOP 2018 :
« BISCUITS SABLE BEU » `01.1.8` → `01.1.1` (les biscuits sont des produits de boulangerie,
01.1.1.3) et « GAZPACHO VERDE 1L » `01.1.7` → `01.1.9` (soupe prête à consommer). Le dictionnaire
a été corrigé dans le même sens (« MCCAIN AIRFRY » : frites surgelées = 01.1.7.9, ce qui supprime
la dernière erreur de l'évaluation). Les références et le dictionnaire étant maintenant d'accord,
l'évaluation sans bruit affiche 100 % : elle sert de garde-fou, pas de preuve de justesse.

