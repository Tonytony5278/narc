/**
 * PanierClair — DOCX Generator
 * Builds Plan Financier and Plan d'Affaires as OOXML-compliant Word documents.
 * Uses JSZip to assemble raw XML parts so that charts are genuine OOXML objects
 * (not images) and open correctly in Microsoft Word.
 */

import JSZip from 'jszip';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape characters that are illegal inside XML text nodes. */
function xe(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build a minimal but valid DOCX ZIP.
 *
 * @param {string} titleText   - Document title shown in the body
 * @param {string} docName     - Short name used in the footer
 * @param {Array}  bodyParts   - Array of XML strings for <w:body> children
 * @param {Array}  charts      - Array of chart descriptor objects
 * @returns {Promise<Buffer>}
 */
async function buildDocx(titleText, docName, bodyParts, charts) {
  const zip = new JSZip();

  // ── [Content_Types].xml ──────────────────────────────────────────────────
  const chartContentTypes = charts
    .map(
      (_, i) =>
        `<Override PartName="/word/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
    )
    .join('\n    ');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"     ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer1.xml"    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/app.xml"    ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml"   ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  ${chartContentTypes}
</Types>`
  );

  // ── _rels/.rels ──────────────────────────────────────────────────────────
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
  );

  // ── docProps/app.xml ─────────────────────────────────────────────────────
  zip.file(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Microsoft Office Word</Application>
  <Company>PanierClair</Company>
</Properties>`
  );

  // ── docProps/core.xml ────────────────────────────────────────────────────
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xe(titleText)}</dc:title>
  <dc:creator>PanierClair</dc:creator>
  <cp:lastModifiedBy>PanierClair</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-03-01T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-03-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>`
  );

  // ── word/styles.xml ──────────────────────────────────────────────────────
  zip.file('word/styles.xml', buildStylesXml());

  // ── word/settings.xml ────────────────────────────────────────────────────
  zip.file(
    'word/settings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
  <w:compat>
    <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  </w:compat>
</w:settings>`
  );

  // ── word/footer1.xml ─────────────────────────────────────────────────────
  zip.file('word/footer1.xml', buildFooterXml(docName));

  // ── word/_rels/footer1.xml.rels ──────────────────────────────────────────
  zip.file(
    'word/_rels/footer1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
  );

  // ── Charts ───────────────────────────────────────────────────────────────
  const chartRels = [];
  charts.forEach((chart, i) => {
    const chartId = i + 1;
    const rId = `rId_chart${chartId}`;
    chartRels.push({ rId, chartId });

    zip.file(`word/charts/chart${chartId}.xml`, chart.xml);
    zip.file(
      `word/charts/_rels/chart${chartId}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
    );
  });

  // ── word/_rels/document.xml.rels ─────────────────────────────────────────
  const chartRelEntries = chartRels
    .map(
      ({ rId, chartId }) =>
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart${chartId}.xml"/>`
    )
    .join('\n  ');

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId_styles"  Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"  Target="styles.xml"/>
  <Relationship Id="rId_settings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId_footer1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  ${chartRelEntries}
</Relationships>`
  );

  // ── word/document.xml ────────────────────────────────────────────────────
  const chartDrawings = chartRels.map(({ rId, chartId }, idx) =>
    buildChartDrawing(rId, chartId, charts[idx].title, chartId)
  );

  zip.file(
    'word/document.xml',
    buildDocumentXml(titleText, bodyParts, chartDrawings)
  );

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------
// XML builders
// ---------------------------------------------------------------------------

function buildDocumentXml(titleText, bodyParts, chartDrawings) {
  const chartDrawingsXml = chartDrawings.join('\n');
  const body = bodyParts.join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
            xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
            mc:Ignorable="w14 w15 w16se wp14">
  <w:body>
    ${wp(titleText, 'Title')}
    ${tocField()}
    ${body}
    ${chartDrawingsXml}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId_footer1"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

/** Paragraph helper */
function wp(text, style, opts = {}) {
  const styleXml = style
    ? `<w:pPr><w:pStyle w:val="${style}"/>${opts.spacing ? `<w:spacing w:before="${opts.spacing}"/>` : ''}</w:pPr>`
    : '';
  const bold = opts.bold ? '<w:b/>' : '';
  return `<w:p>${styleXml}<w:r><w:rPr>${bold}</w:rPr><w:t xml:space="preserve">${xe(text)}</w:t></w:r></w:p>`;
}

/** Table builder */
function wTable(headers, rows) {
  const tblPr = `<w:tblPr>
    <w:tblStyle w:val="TableGrid"/>
    <w:tblW w:w="9360" w:type="dxa"/>
    <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
  </w:tblPr>`;

  const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers
    .map(
      (h) =>
        `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="1F5C99"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>${xe(h)}</w:t></w:r></w:p></w:tc>`
    )
    .join('')}</w:tr>`;

  const dataRows = rows
    .map((row, rIdx) => {
      const fill = rIdx % 2 === 0 ? 'DEEAF1' : 'FFFFFF';
      const isBold = String(row[0]).startsWith('TOTAL') || String(row[0]).startsWith('**');
      const cells = row
        .map((cell) => {
          const cellText = String(cell).replace(/^\*\*|\*\*$/g, '');
          return `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr><w:p><w:r><w:rPr>${isBold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${xe(cellText)}</w:t></w:r></w:p></w:tc>`;
        })
        .join('');
      return `<w:tr>${cells}</w:tr>`;
    })
    .join('');

  return `<w:tbl>${tblPr}${headerRow}${dataRows}</w:tbl>`;
}

/** Table of Contents field */
function tocField() {
  return `<w:p>
    <w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>
    <w:r><w:t>Table des matières</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:pStyle w:val="TOC1"/></w:pPr>
    <w:fldSimple w:instr=" TOC \\o &quot;1-3&quot; \\h \\z \\u ">
      <w:r><w:rPr><w:noProof/></w:rPr><w:t>[ Mettre à jour la table des matières dans Word : clic droit → Mettre à jour les champs ]</w:t></w:r>
    </w:fldSimple>
  </w:p>
  <w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

/** Footer XML with page numbers */
function buildFooterXml(docName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:jc w:val="center"/>
      <w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>
    </w:pPr>
    <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">PanierClair — ${xe(docName)} | Mars 2026 — Page </w:t></w:r>
    <w:fldChar w:fldCharType="begin"/>
    <w:instrText> PAGE </w:instrText>
    <w:fldChar w:fldCharType="end"/>
    <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve"> / </w:t></w:r>
    <w:fldChar w:fldCharType="begin"/>
    <w:instrText> NUMPAGES </w:instrText>
    <w:fldChar w:fldCharType="end"/>
  </w:p>
</w:ftr>`;
}

/** Chart drawing element to embed inside document.xml */
function buildChartDrawing(rId, chartId, title, drawingId) {
  return `<w:p>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0"
                 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="5486400" cy="3200400"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="${drawingId}" name="${xe(title)}"/>
        <wp:cNvGraphicFramePr/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
            <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
                     xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                     r:id="${rId}"/>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
}

/** Styles XML */
function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
          xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
          mc:Ignorable="w14">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:lang w:val="fr-CA" w:eastAsia="fr-CA" w:bidi="ar-SA"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/><w:color w:val="1F5C99"/><w:sz w:val="52"/><w:szCs w:val="52"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:outlineLvl w:val="0"/>
      <w:spacing w:before="480" w:after="120"/>
      <w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="1F5C99"/></w:pBdr>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/><w:color w:val="1F5C99"/><w:sz w:val="32"/><w:szCs w:val="32"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:outlineLvl w:val="1"/>
      <w:spacing w:before="360" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/><w:color w:val="2E74B5"/><w:sz w:val="26"/><w:szCs w:val="26"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:outlineLvl w:val="2"/>
      <w:spacing w:before="280" w:after="60"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/><w:color w:val="5B9BD5"/><w:sz w:val="24"/><w:szCs w:val="24"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="TOCHeading">
    <w:name w:val="TOC Heading"/>
    <w:basedOn w:val="Heading1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="TOC1">
    <w:name w:val="toc 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="80" w:after="40"/><w:ind w:left="0"/></w:pPr>
  </w:style>

  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:basedOn w:val="TableNormal"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>

  <w:style w:type="table" w:styleId="TableNormal">
    <w:name w:val="Normal Table"/>
    <w:tblPr>
      <w:tblCellMar>
        <w:top    w:w="0"   w:type="dxa"/>
        <w:left   w:w="108" w:type="dxa"/>
        <w:bottom w:w="0"   w:type="dxa"/>
        <w:right  w:w="108" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  </w:style>
</w:styles>`;
}

// ---------------------------------------------------------------------------
// OOXML Chart XML builders
// ---------------------------------------------------------------------------

function chartBarClustered(chartTitle, categories, series) {
  const seriesXml = series
    .map((s, idx) => {
      const pts = s.values
        .map((v, pi) => `<c:pt idx="${pi}"><c:v>${v}</c:v></c:pt>`)
        .join('');
      const catPts = categories
        .map((c, ci) => `<c:pt idx="${ci}"><c:v>${xe(c)}</c:v></c:pt>`)
        .join('');
      return `<c:ser>
        <c:idx val="${idx}"/><c:order val="${idx}"/>
        <c:tx><c:strRef><c:f>Sheet1!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xe(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>
        <c:cat><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="${categories.length}"/>${catPts}</c:strCache></c:strRef></c:cat>
        <c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.values.length}"/>${pts}</c:numCache></c:numRef></c:val>
      </c:ser>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="fr-CA"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-CA" b="1"/><a:t>${xe(chartTitle)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:axId val="1"/><c:axId val="2"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function chartBarStacked(chartTitle, categories, series) {
  const seriesXml = series
    .map((s, idx) => {
      const pts = s.values
        .map((v, pi) => `<c:pt idx="${pi}"><c:v>${v}</c:v></c:pt>`)
        .join('');
      const catPts = categories
        .map((c, ci) => `<c:pt idx="${ci}"><c:v>${xe(c)}</c:v></c:pt>`)
        .join('');
      return `<c:ser>
        <c:idx val="${idx}"/><c:order val="${idx}"/>
        <c:tx><c:strRef><c:f>Sheet1!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xe(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>
        <c:cat><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="${categories.length}"/>${catPts}</c:strCache></c:strRef></c:cat>
        <c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.values.length}"/>${pts}</c:numCache></c:numRef></c:val>
      </c:ser>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="fr-CA"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-CA" b="1"/><a:t>${xe(chartTitle)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="stacked"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:axId val="1"/><c:axId val="2"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function chartLine(chartTitle, categories, series) {
  const seriesXml = series
    .map((s, idx) => {
      const pts = s.values
        .map((v, pi) => `<c:pt idx="${pi}"><c:v>${v}</c:v></c:pt>`)
        .join('');
      const catPts = categories
        .map((c, ci) => `<c:pt idx="${ci}"><c:v>${xe(c)}</c:v></c:pt>`)
        .join('');
      return `<c:ser>
        <c:idx val="${idx}"/><c:order val="${idx}"/>
        <c:tx><c:strRef><c:f>Sheet1!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xe(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>
        <c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>
        <c:cat><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="${categories.length}"/>${catPts}</c:strCache></c:strRef></c:cat>
        <c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.values.length}"/>${pts}</c:numCache></c:numRef></c:val>
        <c:smooth val="0"/>
      </c:ser>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="fr-CA"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-CA" b="1"/><a:t>${xe(chartTitle)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:marker><c:symbol val="none"/></c:marker>
        <c:axId val="1"/><c:axId val="2"/>
      </c:lineChart>
      <c:catAx>
        <c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="b"/>
        <c:tickLblSkip val="1"/><c:crossAx val="2"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function chartDoughnut(chartTitle, labels, values) {
  const pts = values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join('');
  const lblPts = labels
    .map((l, i) => `<c:pt idx="${i}"><c:v>${xe(l)}</c:v></c:pt>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="fr-CA"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-CA" b="1"/><a:t>${xe(chartTitle)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:doughnutChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/><c:order val="0"/>
          <c:tx><c:strRef><c:f>Sheet1!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xe(chartTitle)}</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:cat><c:strRef><c:f>Sheet1!$A$2</c:f><c:strCache><c:ptCount val="${labels.length}"/>${lblPts}</c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache></c:numRef></c:val>
        </c:ser>
        <c:firstSliceAng val="0"/>
        <c:holeSize val="50"/>
      </c:doughnutChart>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

// ---------------------------------------------------------------------------
// Document content builders
// ---------------------------------------------------------------------------

function buildPlanFinancierBody() {
  const parts = [];

  // 1. Résumé Exécutif
  parts.push(wp('1. Résumé Exécutif', 'Heading1'));
  parts.push(
    wp(
      'PanierClair est une application SaaS mobile et web destinée aux familles canadiennes-françaises souhaitant maîtriser leur budget d\'épicerie. Dans un contexte d\'inflation alimentaire persistante au Canada, PanierClair répond à un besoin concret et croissant : aider les ménages à planifier leurs achats, suivre leurs dépenses et optimiser leur panier de façon simple et intuitive.',
      'Normal'
    )
  );
  parts.push(
    wp(
      'Ce plan financier couvre les exercices 2026 à 2028. À l\'horizon de l\'année 3, PanierClair projette 544 200 $ de revenus annuels et une réduction significative de son déficit opérationnel, ouvrant la voie à la rentabilité dès l\'année 4. Un financement d\'amorçage de 300 000 $ a déjà été sécurisé, et une levée de fonds Série A de 800 000 $ est planifiée pour la mi-année 2.',
      'Normal'
    )
  );

  // 2. Hypothèses Clés
  parts.push(wp('2. Hypothèses Clés', 'Heading1'));
  const hypoHeaders = ['Paramètre', 'Valeur / Description'];
  const hypoRows = [
    ['Taux de conversion freemium → premium', '8 % (an 1), 10 % (an 2), 12 % (an 3)'],
    ['Prix premium mensuel', '9,99 $ CAD/mois'],
    ['Prix premium annuel', '79,99 $ CAD/an'],
    ['UAM (Utilisateurs Actifs Mensuels)', '5 000 (an 1) → 18 000 (an 2) → 42 000 (an 3)'],
    ['Abonnés premium', '400 (an 1) → 1 800 (an 2) → 5 040 (an 3)'],
    ['Partenariats B2B', '2 (an 1) → 5 (an 2) → 12 (an 3)'],
    ['Revenu B2B par partenariat', '8 000 $/an'],
    ['Taux de churn mensuel', '3,0 % (an 1), 2,5 % (an 2), 2,0 % (an 3)'],
    ['Coût d\'acquisition client (CAC)', '18 $ (an 1), 15 $ (an 2), 12 $ (an 3)'],
    ['Valeur vie client (LTV)', '110 $ (an 1), 150 $ (an 2), 210 $ (an 3)'],
  ];
  parts.push(wTable(hypoHeaders, hypoRows));

  // 3. Projections de Revenus
  parts.push(wp('3. Projections de Revenus (Années 1–3)', 'Heading1'));
  const revHeaders = ['Source de revenus', 'Année 1', 'Année 2', 'Année 3'];
  const revRows = [
    ['Abonnements premium', '32 000 $', '144 000 $', '403 200 $'],
    ['Partenariats B2B', '16 000 $', '40 000 $', '96 000 $'],
    ['Publicité (tier gratuit)', '5 000 $', '18 000 $', '45 000 $'],
    ['**TOTAL REVENUS**', '53 000 $', '202 000 $', '544 200 $'],
  ];
  parts.push(wTable(revHeaders, revRows));
  parts.push(wp('Graphique 1 — Revenus vs Charges vs Résultat Net :', 'Heading2'));
  // Chart 1 will be appended after body

  // 4. Charges d'Exploitation
  parts.push(wp('4. Charges d\'Exploitation (Années 1–3)', 'Heading1'));
  const chargeHeaders = ['Poste de dépenses', 'Année 1', 'Année 2', 'Année 3'];
  const chargeRows = [
    ['Salaires et avantages sociaux (équipe 3→5→8)', '180 000 $', '280 000 $', '420 000 $'],
    ['Infrastructure cloud (AWS / GCP)', '12 000 $', '24 000 $', '48 000 $'],
    ['Marketing et acquisition client', '30 000 $', '55 000 $', '80 000 $'],
    ['Frais légaux et comptables', '15 000 $', '18 000 $', '20 000 $'],
    ['Outils et licences SaaS', '8 000 $', '12 000 $', '16 000 $'],
    ['Divers et imprévus', '10 000 $', '15 000 $', '20 000 $'],
    ['**TOTAL CHARGES**', '255 000 $', '404 000 $', '604 000 $'],
  ];
  parts.push(wTable(chargeHeaders, chargeRows));
  parts.push(wp('Graphique 2 — Ventilation des revenus par source :', 'Heading2'));

  // 5. Résultat Net
  parts.push(wp('5. Résultat Net (Années 1–3)', 'Heading1'));
  const netHeaders = ['Indicateur', 'Année 1', 'Année 2', 'Année 3'];
  const netRows = [
    ['Total revenus', '53 000 $', '202 000 $', '544 200 $'],
    ['Total charges', '255 000 $', '404 000 $', '604 000 $'],
    ['**Résultat net**', '-202 000 $', '-202 000 $', '-59 800 $'],
    ['Résultat cumulatif', '-202 000 $', '-404 000 $', '-463 800 $'],
  ];
  parts.push(wTable(netHeaders, netRows));
  parts.push(
    wp(
      'Note : Le déficit des trois premières années est financé par capital de risque (amorçage + Série A). La rentabilité opérationnelle est projetée au cours de l\'année 4.',
      'Normal'
    )
  );

  // 6. Flux de Trésorerie
  parts.push(wp('6. Flux de Trésorerie — Année 1 (Mensuel)', 'Heading1'));
  const cfHeaders = ['Mois', 'Revenus', 'Dépenses', 'Flux Net', 'Solde Cumulatif'];
  const cfRows = [
    ['Janvier',   '1 200 $',  '21 250 $', '-20 050 $', '279 950 $'],
    ['Février',   '1 500 $',  '21 250 $', '-19 750 $', '260 200 $'],
    ['Mars',      '2 000 $',  '21 250 $', '-19 250 $', '240 950 $'],
    ['Avril',     '2 500 $',  '21 250 $', '-18 750 $', '222 200 $'],
    ['Mai',       '3 000 $',  '21 250 $', '-18 250 $', '203 950 $'],
    ['Juin',      '3 500 $',  '21 250 $', '-17 750 $', '186 200 $'],
    ['Juillet',   '4 000 $',  '21 250 $', '-17 250 $', '168 950 $'],
    ['Août',      '4 500 $',  '21 250 $', '-16 750 $', '152 200 $'],
    ['Septembre', '5 000 $',  '21 250 $', '-16 250 $', '135 950 $'],
    ['Octobre',   '5 300 $',  '21 250 $', '-15 950 $', '120 000 $'],
    ['Novembre',  '5 700 $',  '21 250 $', '-15 550 $', '104 450 $'],
    ['Décembre',  '6 000 $',  '21 250 $', '-15 250 $',  '89 200 $'],
    ['**TOTAL**', '44 200 $', '255 000 $', '-210 800 $', '—'],
  ];
  parts.push(wTable(cfHeaders, cfRows));
  parts.push(wp('Graphique 3 — Solde de trésorerie cumulatif (Année 1) :', 'Heading2'));

  // 7. Besoins en Financement
  parts.push(wp('7. Besoins en Financement', 'Heading1'));
  const fundHeaders = ['Tranche', 'Montant', 'Statut', 'Utilisation principale'];
  const fundRows = [
    ['Amorçage (seed)', '300 000 $', 'Sécurisé', 'MVP, équipe initiale, lancement'],
    ['Série A', '800 000 $', 'Planifiée (mi-an 2)', 'Croissance équipe, marketing, API B2B'],
  ];
  parts.push(wTable(fundHeaders, fundRows));

  parts.push(wp('Utilisation des fonds — Amorçage (300 000 $)', 'Heading2'));
  const seedHeaders = ['Poste', 'Montant', 'Pourcentage'];
  const seedRows = [
    ['Développement produit (MVP + V1)', '120 000 $', '40 %'],
    ['Salaires fondateurs (18 mois)', '90 000 $', '30 %'],
    ['Marketing lancement', '45 000 $', '15 %'],
    ['Infrastructure et opérations', '25 000 $', '8 %'],
    ['Frais légaux et constitution', '20 000 $', '7 %'],
    ['**TOTAL**', '300 000 $', '100 %'],
  ];
  parts.push(wTable(seedHeaders, seedRows));

  // 8. KPI
  parts.push(wp('8. Indicateurs de Performance Clés (KPI)', 'Heading1'));
  const kpiHeaders = ['Indicateur', 'Année 1', 'Année 2', 'Année 3'];
  const kpiRows = [
    ['UAM (Utilisateurs Actifs Mensuels)', '5 000', '18 000', '42 000'],
    ['Abonnés Premium', '400', '1 800', '5 040'],
    ['ARPU mensuel (premium)', '8,33 $', '8,33 $', '8,33 $'],
    ['Coût d\'Acquisition Client (CAC)', '18,00 $', '15,00 $', '12,00 $'],
    ['Valeur Vie Client (LTV)', '110 $', '150 $', '210 $'],
    ['Ratio LTV / CAC', '6,1', '10,0', '17,5'],
    ['Taux de churn mensuel', '3,0 %', '2,5 %', '2,0 %'],
    ['Marge brute', '62 %', '71 %', '78 %'],
  ];
  parts.push(wTable(kpiHeaders, kpiRows));
  parts.push(wp('Graphique 4 — Croissance UAM et Abonnés Premium :', 'Heading2'));

  // 9. Analyse de Sensibilité
  parts.push(wp('9. Analyse de Sensibilité — Année 3', 'Heading1'));
  const sensHeaders = ['Indicateur', 'Scénario Conservateur', 'Scénario de Base', 'Scénario Optimiste'];
  const sensRows = [
    ['Taux de conversion', '8 %', '12 %', '16 %'],
    ['UAM', '30 000', '42 000', '60 000'],
    ['Abonnés premium', '2 400', '5 040', '9 600'],
    ['Revenus abonnements', '240 000 $', '403 200 $', '960 000 $'],
    ['Revenus B2B', '64 000 $', '96 000 $', '128 000 $'],
    ['Revenus publicité', '28 000 $', '45 000 $', '72 000 $'],
    ['**Total revenus**', '332 000 $', '544 200 $', '1 160 000 $'],
    ['Résultat net', '-272 000 $', '-59 800 $', '556 000 $'],
  ];
  parts.push(wTable(sensHeaders, sensRows));
  parts.push(wp('Graphique 5 — Comparaison des scénarios de sensibilité :', 'Heading2'));

  // 10. Conclusion
  parts.push(wp('10. Conclusion', 'Heading1'));
  parts.push(
    wp(
      'PanierClair présente un profil financier caractéristique des startups SaaS à forte croissance : des pertes contrôlées durant les premières années, suivies d\'une accélération vers la rentabilité. La trajectoire décrite dans ce plan est fondée sur des hypothèses prudentes (scénario de base) et peut être significativement améliorée dans un scénario optimiste. L\'équipe de PanierClair est engagée à livrer une exécution rigoureuse, à mesurer ses KPI de façon hebdomadaire et à ajuster sa stratégie en temps réel. Avec le financement Série A en place, PanierClair sera en excellente position pour atteindre la rentabilité dès l\'année 4 et s\'imposer comme le leader de la gestion de budget alimentaire en français au Canada.',
      'Normal'
    )
  );

  return parts;
}

function buildPlanAffairesBody() {
  const parts = [];

  // 1. Sommaire Exécutif
  parts.push(wp('1. Sommaire Exécutif', 'Heading1'));
  parts.push(
    wp(
      'PanierClair est une application SaaS mobile et web en français qui aide les familles canadiennes-françaises à gérer leur budget d\'épicerie. Dans un contexte où l\'inflation alimentaire a dépassé 8 % au Canada en 2023–2024, les ménages cherchent activement des outils pour contrôler leurs dépenses sans sacrifier la qualité de leur alimentation.',
      'Normal'
    )
  );
  parts.push(
    wp(
      'Fondée à Montréal, PanierClair propose une solution intuitive combinant liste de courses intelligente, suivi des dépenses en temps réel, alertes budgétaires personnalisées et suggestions de recettes adaptées au budget disponible. L\'interface entièrement francophone et l\'intégration avec les circulaires des épiceries québécoises différencient PanierClair de tous les concurrents anglophones existants.',
      'Normal'
    )
  );
  parts.push(
    wp(
      'Nous recherchons un financement Série A de 800 000 $ pour accélérer notre croissance, atteindre 42 000 utilisateurs actifs en an 3 et 544 200 $ de revenus annuels, avec un retour à la rentabilité projeté en an 4.',
      'Normal'
    )
  );

  // 2. Description de l'Entreprise
  parts.push(wp('2. Description de l\'Entreprise', 'Heading1'));
  const descHeaders = ['Attribut', 'Détail'];
  const descRows = [
    ['Nom commercial', 'PanierClair'],
    ['Forme juridique', 'Société par actions (SPA) — Québec'],
    ['Siège social', 'Montréal, Québec, Canada'],
    ['Secteur', 'FinTech — Gestion de budget personnel'],
    ['Stade', 'Pré-lancement / amorçage (seed)'],
    ['Mission', 'Rendre la gestion du budget alimentaire simple, transparente et accessible'],
    ['Langues', '100 % français canadien'],
  ];
  parts.push(wTable(descHeaders, descRows));

  // 3. Analyse du Marché
  parts.push(wp('3. Analyse du Marché', 'Heading1'));

  parts.push(wp('Taille du marché (TAM / SAM / SOM)', 'Heading2'));
  const marketHeaders = ['Segment', 'Définition', 'Valeur estimée'];
  const marketRows = [
    ['TAM — Marché Total Adressable', 'Tous les ménages canadiens avec smartphone utilisant une app de budget ou d\'épicerie', '2,1 milliards $'],
    ['SAM — Marché Accessible', 'Ménages francophones au Québec et en Ontario cherchant une solution francophone', '420 millions $'],
    ['SOM — Marché Cible', 'Part de marché réaliste sur 3 ans avec les ressources actuelles', '21 millions $'],
  ];
  parts.push(wTable(marketHeaders, marketRows));
  parts.push(wp('Graphique — Marché TAM / SAM / SOM :', 'Heading2'));

  parts.push(wp('Analyse concurrentielle', 'Heading2'));
  const concurHeaders = ['Concurrent', 'Forces', 'Faiblesses', 'Prix', 'Langue'];
  const concurRows = [
    ['Mint (Intuit)', 'Marque forte, intégration bancaire', 'Anglais seulement, peu de focus épicerie', 'Gratuit', 'EN'],
    ['YNAB', 'Méthodologie reconnue, communauté active', 'Anglais seulement, complexe pour débutants', '14,99 $/mois', 'EN'],
    ['Flipp', 'Intégration circulaires, large réseau', 'Pas de suivi budget, pas de personnalisation', 'Gratuit', 'EN/FR partiel'],
    ['Reebee', 'Circulaires numériques, version française', 'Pas de budget, pas de suivi dépenses', 'Gratuit', 'EN/FR'],
    ['PanierClair', '100 % français, budget + épicerie intégrés', 'Nouveau, peu connu', 'Freemium', 'FR'],
  ];
  parts.push(wTable(concurHeaders, concurRows));

  // 4. Produit et Services
  parts.push(wp('4. Produit et Services', 'Heading1'));

  parts.push(wp('Fonctionnalités par tier', 'Heading2'));
  const featHeaders = ['Fonctionnalité', 'Gratuit', 'Premium'];
  const featRows = [
    ['Listes de courses (illimitées)', '✓', '✓'],
    ['Suivi des dépenses par catégorie', '✓', '✓'],
    ['Budget mensuel configurable', '✓', '✓'],
    ['Accès circulaires des épiceries partenaires', '✓', '✓'],
    ['Suggestions de recettes de base', '✓', '✓'],
    ['Analyse des habitudes (historique 12 mois)', '—', '✓'],
    ['Alertes intelligentes (budget imminent)', '—', '✓'],
    ['Comparateur de prix entre épiceries', '—', '✓'],
    ['Recettes personnalisées (items en spécial)', '—', '✓'],
    ['Export données (PDF, CSV)', '—', '✓'],
    ['Support prioritaire', '—', '✓'],
  ];
  parts.push(wTable(featHeaders, featRows));

  parts.push(wp('Feuille de route produit (2026–2028)', 'Heading2'));
  const roadHeaders = ['Période', 'Livrables clés', 'Priorité'];
  const roadRows = [
    ['T1 2026', 'MVP : liste de courses + suivi dépenses + budget de base', 'Critique'],
    ['T2 2026', 'Intégration circulaires (IGA, Metro, Maxi) + alertes budget', 'Critique'],
    ['T3 2026', 'Suggestions recettes + comparateur prix', 'Haute'],
    ['T4 2026', 'Application mobile iOS + Android (React Native)', 'Critique'],
    ['T1 2027', 'Tableau de bord analytique premium + export données', 'Haute'],
    ['T2 2027', 'API B2B pour partenaires épicerie', 'Haute'],
    ['T3 2027', 'Intégration Costco + Provigo', 'Moyenne'],
    ['T4 2027', 'Fonctionnalité multi-profils (famille partagée)', 'Moyenne'],
    ['T1 2028', 'Intelligence artificielle : prédictions de dépenses', 'Moyenne'],
    ['T2 2028', 'Expansion Ontario (version bilingue)', 'Moyenne'],
  ];
  parts.push(wTable(roadHeaders, roadRows));

  // 5. Stratégie de Mise en Marché
  parts.push(wp('5. Stratégie de Mise en Marché', 'Heading1'));
  parts.push(
    wp(
      'Notre stratégie d\'acquisition repose sur deux piliers complémentaires : la croissance organique (SEO francophone, médias sociaux, bouche-à-oreille via programme de référencement) et l\'acquisition payante ciblée (Google Ads, Meta Ads). Pour la rétention, nous investissons dans un onboarding guidé, des courriels hebdomadaires personnalisés et une gamification légère (badges « Budget Maîtrisé », « Champion des Spéciaux »).',
      'Normal'
    )
  );
  const chanHeaders = ['Canal', 'Type', 'CAC estimé', 'Volume attendu (an 1)'];
  const chanRows = [
    ['SEO / contenu (blog budget)', 'Organique', '~5 $', '1 500 utilisateurs'],
    ['Médias sociaux (Facebook/Instagram)', 'Organique', '~8 $', '1 000 utilisateurs'],
    ['Programme de référencement', 'Organique', '~6 $', '800 utilisateurs'],
    ['Google Ads', 'Payant', '~25 $', '1 200 utilisateurs'],
    ['Facebook/Instagram Ads', 'Payant', '~22 $', '500 utilisateurs'],
  ];
  parts.push(wTable(chanHeaders, chanRows));

  // 6. Modèle d'Affaires
  parts.push(wp('6. Modèle d\'Affaires', 'Heading1'));
  const revHeaders = ['Source', 'Mécanisme', 'Année 1', 'Année 2', 'Année 3'];
  const revRows = [
    ['Abonnements Premium', '9,99 $/mois ou 79,99 $/an', '32 000 $', '144 000 $', '403 200 $'],
    ['Partenariats B2B', 'Licence API + analyse données', '16 000 $', '40 000 $', '96 000 $'],
    ['Publicité', 'Réseau programmatique (tier gratuit)', '5 000 $', '18 000 $', '45 000 $'],
    ['**Total**', '', '53 000 $', '202 000 $', '544 200 $'],
  ];
  parts.push(wTable(revHeaders, revRows));

  // 7. Plan Opérationnel
  parts.push(wp('7. Plan Opérationnel', 'Heading1'));

  parts.push(wp('Équipe fondatrice', 'Heading2'));
  const teamHeaders = ['Rôle', 'Responsabilités', 'Expérience'];
  const teamRows = [
    ['PDG / Co-fondateur', 'Vision, stratégie, partenariats B2B, levée de fonds', '8 ans technologie, MBA HEC Montréal'],
    ['CTO / Co-fondateur', 'Architecture technique, développement backend, DevOps', '10 ans développement full-stack, ex-Shopify'],
    ['Directeur·trice Produit', 'UX/UI, feuille de route, recherche utilisateurs', '6 ans gestion de produit SaaS'],
  ];
  parts.push(wTable(teamHeaders, teamRows));

  parts.push(wp('Infrastructure technologique', 'Heading2'));
  const infraHeaders = ['Composante', 'Technologie', 'Justification'];
  const infraRows = [
    ['Backend API', 'Node.js + TypeScript + PostgreSQL', 'Performance, typage fort, maturité'],
    ['Frontend web', 'React + Next.js', 'SEO, performance, écosystème riche'],
    ['Application mobile', 'React Native', 'Code partagé iOS/Android'],
    ['Infrastructure cloud', 'AWS (ECS + RDS + S3 + CloudFront)', 'Fiabilité, scalabilité, conformité PIPEDA'],
    ['Authentification', 'Auth0', 'Sécurité, MFA, conformité'],
    ['Paiements', 'Stripe', 'Leader mondial, support CAD'],
    ['CI/CD', 'GitHub Actions', 'Intégration native, déploiements automatisés'],
    ['Hébergement', 'AWS ca-central-1 (Montréal)', 'Données au Canada, conformité Loi 25'],
  ];
  parts.push(wTable(infraHeaders, infraRows));

  // 8. Plan Financier (Résumé)
  parts.push(wp('8. Plan Financier (Résumé)', 'Heading1'));
  parts.push(
    wp(
      'Pour le plan financier complet, voir le document « PanierClair — Plan Financier 2026–2028 ».',
      'Normal'
    )
  );
  const finHeaders = ['Indicateur', 'Année 1', 'Année 2', 'Année 3'];
  const finRows = [
    ['UAM', '5 000', '18 000', '42 000'],
    ['Abonnés Premium', '400', '1 800', '5 040'],
    ['Revenus totaux', '53 000 $', '202 000 $', '544 200 $'],
    ['Charges totales', '255 000 $', '404 000 $', '604 000 $'],
    ['Résultat net', '-202 000 $', '-202 000 $', '-59 800 $'],
  ];
  parts.push(wTable(finHeaders, finRows));

  // 9. Risques et Mitigation
  parts.push(wp('9. Risques et Mitigation', 'Heading1'));
  const riskHeaders = ['Risque', 'Probabilité', 'Impact', 'Stratégie de mitigation'];
  const riskRows = [
    ['Adoption lente par les utilisateurs', 'Moyenne', 'Élevé', 'Programme de référencement + partenariats médias'],
    ['Concurrence d\'un acteur majeur (Google, Apple)', 'Faible', 'Très élevé', 'Positionnement hyper-local francophone difficile à répliquer'],
    ['Difficulté à signer des partenariats B2B', 'Moyenne', 'Moyen', 'Offre pilote gratuite + accès données exclusives'],
    ['Dépassement des coûts de développement', 'Moyenne', 'Moyen', 'Architecture modulaire, MVP d\'abord, sprints agiles de 2 semaines'],
    ['Attrition élevée (churn) des abonnés Premium', 'Moyenne', 'Élevé', 'Onboarding amélioré, gamification, programme fidélité'],
    ['Problèmes de conformité Loi 25', 'Faible', 'Élevé', 'Avocat spécialisé retenu dès la phase d\'amorçage'],
    ['Pénurie de talent tech au Québec', 'Élevée', 'Moyen', 'Remote-first, salaires compétitifs, équité (ESOP)'],
  ];
  parts.push(wTable(riskHeaders, riskRows));

  // 10. Conclusion
  parts.push(wp('10. Conclusion et Appel à l\'Action', 'Heading1'));
  parts.push(
    wp(
      'PanierClair se positionne au carrefour de deux tendances majeures : la numérisation du quotidien des familles québécoises et la pression croissante sur les budgets alimentaires. Notre solution comble un vide réel dans l\'écosystème numérique francophone canadien — aucun concurrent actuel ne combine liste de courses intelligente, suivi budgétaire et intégration avec les épiceries québécoises dans une application entièrement en français.',
      'Normal'
    )
  );
  parts.push(
    wp(
      'Nous invitons les investisseurs alignés avec notre vision à se joindre à la Série A de 800 000 $ pour propulser PanierClair vers sa phase de croissance accélérée. Avec ce financement, PanierClair atteindra 42 000 utilisateurs actifs et 544 200 $ de revenus en an 3, établissant les bases d\'une expansion pancanadienne francophone dès 2029.',
      'Normal'
    )
  );
  parts.push(
    wp(
      'Pour plus d\'informations : contact@panierclair.ca | panierclair.ca — Document préparé en mars 2026 — Confidentiel',
      'Normal'
    )
  );

  return parts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🇨🇦 PanierClair — Génération des documents Word...\n');

  // ── Plan Financier charts ──────────────────────────────────────────────
  const chartsPF = [
    {
      title: 'Revenus vs Charges vs Résultat Net',
      xml: chartBarClustered(
        'Revenus vs Charges vs Résultat Net (Années 1–3)',
        ['Année 1', 'Année 2', 'Année 3'],
        [
          { name: 'Revenus',      values: [53000, 202000, 544200] },
          { name: 'Charges',      values: [255000, 404000, 604000] },
          { name: 'Résultat Net', values: [-202000, -202000, -59800] },
        ]
      ),
    },
    {
      title: 'Ventilation des revenus par source',
      xml: chartBarStacked(
        'Ventilation des revenus par source (Années 1–3)',
        ['Année 1', 'Année 2', 'Année 3'],
        [
          { name: 'Abonnements Premium', values: [32000, 144000, 403200] },
          { name: 'Partenariats B2B',    values: [16000, 40000, 96000] },
          { name: 'Publicité',           values: [5000, 18000, 45000] },
        ]
      ),
    },
    {
      title: 'Solde de trésorerie cumulatif — Année 1',
      xml: chartLine(
        'Solde de trésorerie cumulatif — Année 1',
        ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'],
        [
          {
            name: 'Solde cumulatif ($)',
            values: [279950, 260200, 240950, 222200, 203950, 186200, 168950, 152200, 135950, 120000, 104450, 89200],
          },
        ]
      ),
    },
    {
      title: 'Croissance UAM et Abonnés Premium',
      xml: chartLine(
        'Croissance UAM et Abonnés Premium (Années 1–3)',
        ['Année 1', 'Année 2', 'Année 3'],
        [
          { name: 'UAM',             values: [5000, 18000, 42000] },
          { name: 'Abonnés Premium', values: [400, 1800, 5040] },
        ]
      ),
    },
    {
      title: 'Comparaison des scénarios de sensibilité',
      xml: chartBarClustered(
        'Scénarios de sensibilité — Revenus Année 3',
        ['Conservateur', 'Base', 'Optimiste'],
        [
          { name: 'Revenus totaux ($)', values: [332000, 544200, 1160000] },
        ]
      ),
    },
  ];

  // ── Plan Affaires charts ──────────────────────────────────────────────
  const chartsPA = [
    {
      title: 'Marché TAM / SAM / SOM',
      xml: chartDoughnut(
        'Taille du marché — TAM / SAM / SOM',
        ['TAM (2,1 Md$)', 'SAM (420 M$)', 'SOM (21 M$)'],
        [2100, 420, 21]
      ),
    },
  ];

  // ── Build documents ───────────────────────────────────────────────────
  console.log('📄 Génération du Plan Financier...');
  const pfBody = buildPlanFinancierBody();
  const pfBuffer = await buildDocx(
    'PanierClair — Plan Financier 2026–2028',
    'Plan Financier 2026–2028',
    pfBody,
    chartsPF
  );
  const pfPath = path.join(__dirname, 'PanierClair_Plan_Financier.docx');
  await writeFile(pfPath, pfBuffer);
  const pfSize = Math.round(pfBuffer.length / 1024);
  console.log(`   ✅ Plan Financier généré : ${pfPath} (${pfSize} KB)`);

  console.log('📄 Génération du Plan d\'Affaires...');
  const paBody = buildPlanAffairesBody();
  const paBuffer = await buildDocx(
    "PanierClair — Plan d'Affaires 2026",
    "Plan d'Affaires 2026",
    paBody,
    chartsPA
  );
  const paPath = path.join(__dirname, "PanierClair_Plan_Affaires.docx");
  await writeFile(paPath, paBuffer);
  const paSize = Math.round(paBuffer.length / 1024);
  console.log(`   ✅ Plan d'Affaires généré : ${paPath} (${paSize} KB)`);

  if (pfBuffer.length < 10 * 1024 || paBuffer.length < 10 * 1024) {
    console.error('\n⚠️  AVERTISSEMENT : Un ou plusieurs fichiers font moins de 10 KB — vérifiez le contenu.');
    process.exit(1);
  }

  console.log('\n🎉 Génération terminée avec succès !');
  console.log(`   Plan Financier : ${pfSize} KB`);
  console.log(`   Plan d'Affaires : ${paSize} KB`);
}

main().catch((err) => {
  console.error('❌ Erreur lors de la génération :', err);
  process.exit(1);
});
