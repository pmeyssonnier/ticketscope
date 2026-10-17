// Écriture de fichiers Excel (.xlsx) minimaliste, sans dépendance de lecture.
//
// Remplace la librairie `xlsx` (SheetJS) dont la version npm a des failles
// connues (pollution de prototype, ReDoS) sans correctif publié : TicketScope
// n'a besoin que d'ÉCRIRE des classeurs (feuilles de texte et de nombres).
// Un .xlsx est une archive ZIP de quelques fichiers XML (Office Open XML).

import { zipSync, strToU8 } from 'fflate'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

// Caractères interdits en XML 1.0 (texte OCR : contrôles, substituts isolés…).
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export function escapeXml(value) {
  return String(value)
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 0 -> A, 25 -> Z, 26 -> AA…
export function columnName(index) {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

// Nom de feuille Excel : 31 caractères max, sans []:*?/\ , unique et non vide.
export function sheetName(raw, used) {
  let name = String(raw || '').replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Feuille'
  let base = name
  let i = 2
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${i})`
    name = base.slice(0, 31 - suffix.length) + suffix
    i += 1
  }
  used.add(name.toLowerCase())
  return name
}

// Colonnes = union des clés dans l'ordre d'apparition (comme json_to_sheet).
function columnsOf(rows) {
  const cols = []
  const seen = new Set()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        cols.push(key)
      }
    }
  }
  return cols
}

function cellXml(ref, value, style = 0) {
  const s = style ? ` s="${style}"` : ''
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : ''
  }
  if (typeof value === 'boolean') return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function sheetXml(rows) {
  const cols = columnsOf(rows)
  const widths = cols.map((c) => String(c).length)
  const lines = []

  if (cols.length) {
    lines.push(`<row r="1">${cols.map((c, i) => cellXml(`${columnName(i)}1`, c, 1)).join('')}</row>`)
  }
  rows.forEach((row, r) => {
    const cells = cols
      .map((c, i) => {
        const v = row[c]
        if (v !== null && v !== undefined) widths[i] = Math.max(widths[i], String(v).length)
        return cellXml(`${columnName(i)}${r + 2}`, v)
      })
      .join('')
    lines.push(`<row r="${r + 2}">${cells}</row>`)
  })

  const lastCol = columnName(Math.max(cols.length - 1, 0))
  const dimension = `A1:${lastCol}${rows.length + 1}`
  const colsXml = cols.length
    ? `<cols>${widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(w + 2, 8), 60)}" customWidth="1"/>`)
        .join('')}</cols>`
    : ''
  const frozen = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'

  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}"><dimension ref="${dimension}"/>${frozen}` +
    `<sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${lines.join('')}</sheetData></worksheet>`
  )
}

const STYLES_XML =
  `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'

// sheets : [{ name, rows: [{ colonne: valeur, … }] }] -> Uint8Array (.xlsx)
export function buildXlsx(sheets) {
  const list = sheets.length ? sheets : [{ name: 'Feuille', rows: [] }]
  const used = new Set()
  const names = list.map((s) => sheetName(s.name, used))

  const files = {
    '[Content_Types].xml':
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      list
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('') +
      '</Types>',
    '_rels/.rels':
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
      `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':
      `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
      names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
      list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${list.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES_XML,
  }
  list.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.rows || [])
  })

  const zipInput = {}
  for (const [path, xml] of Object.entries(files)) zipInput[path] = strToU8(xml)
  return zipSync(zipInput, { level: 6 })
}
