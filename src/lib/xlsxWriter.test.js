import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { buildXlsx, columnName, sheetName, escapeXml } from './xlsxWriter.js'
import { flattenRows, summarizeByCoicop } from './exporters.js'

const read = (bytes) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]))

describe('helpers', () => {
  it('noms de colonnes', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  })
  it('échappe le XML et retire les caractères interdits', () => {
    expect(escapeXml('A & B <c> "d"')).toBe('A &amp; B &lt;c&gt; &quot;d&quot;')
    expect(escapeXml('a\u0000b\u0008c\u001Fd\uD800e')).toBe('abcde')
    expect(escapeXml('tab\tnl\ncr\r')).toBe('tab\tnl\ncr\r')
    expect(escapeXml('émoji 😀 ✓')).toBe('émoji 😀 ✓')
  })
  it('noms de feuille valides et uniques', () => {
    const used = new Set()
    expect(sheetName('Synthèse COICOP', used)).toBe('Synthèse COICOP')
    expect(sheetName('a/b:c*d?e[f]g\\h', new Set())).toBe('a b c d e f g h')
    expect(sheetName('x'.repeat(40), new Set())).toHaveLength(31)
    expect(sheetName('', new Set())).toBe('Feuille')
    expect(sheetName('Lignes', used)).toBe('Lignes')
    expect(sheetName('lignes', used)).toBe('lignes (2)')
  })
})

describe('buildXlsx', () => {
  const files = read(buildXlsx([{ name: 'Lignes', rows: [{ produit: 'Lait & œufs', net: 1.15, ok: true, vide: '' }, { produit: '=SOMME(A1)', net: -3.98 }] }, { name: 'Tickets', rows: [] }]))

  it('produit les parties OOXML attendues', () => {
    expect(Object.keys(files).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].sort(),
    )
    expect(files['xl/workbook.xml']).toContain('<sheet name="Lignes" sheetId="1" r:id="rId1"/>')
    expect(files['xl/workbook.xml']).toContain('<sheet name="Tickets" sheetId="2" r:id="rId2"/>')
    expect(files['[Content_Types].xml']).toContain('/xl/worksheets/sheet2.xml')
  })

  it('écrit en-têtes (gras), texte échappé, nombres et booléens typés', () => {
    const sheet = files['xl/worksheets/sheet1.xml']
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">produit</t></is></c>')
    expect(sheet).toContain('<t xml:space="preserve">Lait &amp; œufs</t>')
    expect(sheet).toContain('<c r="B2"><v>1.15</v></c>')
    expect(sheet).toContain('<c r="B3"><v>-3.98</v></c>')
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>')
    expect(sheet).not.toContain('r="D2"') // chaîne vide = cellule absente
    expect(sheet).toContain('<dimension ref="A1:D3"/>')
  })

  it('une feuille vide reste valide', () => {
    const sheet = files['xl/worksheets/sheet2.xml']
    expect(sheet).toContain('<sheetData></sheetData>')
  })

  it('accepte aucune feuille', () => {
    expect(Object.keys(read(buildXlsx([])))).toContain('xl/worksheets/sheet1.xml')
  })

  it('ignore les nombres non finis', () => {
    const f = read(buildXlsx([{ name: 'X', rows: [{ a: NaN, b: Infinity, c: 2 }] }]))
    expect(f['xl/worksheets/sheet1.xml']).not.toMatch(/NaN|Infinity/)
  })
})

describe('export des tickets', () => {
  it('alimente le classeur depuis flattenRows / summarizeByCoicop', () => {
    const tickets = [{ id: 't', date: '2024-03-12', store: 'Colruyt', items: [{ raw: 'LAIT', quantity: 1, unitPrice: 1.15, gross: 1.15, discount: 0, net: 1.15, coicop: '01.1.4', category: 'Lait' }] }]
    const f = read(buildXlsx([{ name: 'Lignes', rows: flattenRows(tickets) }, { name: 'Synthèse COICOP', rows: summarizeByCoicop(tickets) }]))
    expect(f['xl/worksheets/sheet1.xml']).toContain('libelle_brut')
    expect(f['xl/worksheets/sheet2.xml']).toContain('01.1.4')
  })
})
