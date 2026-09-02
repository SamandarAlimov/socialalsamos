import { unzipSync } from 'fflate';

export type DocumentPreviewKind =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'csv'
  | 'markdown'
  | 'text'
  | 'json'
  | 'xml'
  | 'pptx'
  | 'unsupported';

export interface DocxBlock {
  type: 'paragraph' | 'table';
  text?: string;
  style?: string | null;
  rows?: string[][];
}

export interface SpreadsheetSheet {
  name: string;
  rows: string[][];
  truncated: boolean;
}

export type LoadedDocumentPreview =
  | { kind: 'docx'; blocks: DocxBlock[]; truncated: boolean }
  | { kind: 'xlsx' | 'csv'; sheets: SpreadsheetSheet[] }
  | { kind: 'markdown' | 'text' | 'json' | 'xml'; text: string; truncated: boolean }
  | { kind: 'pptx'; slides: Array<{ number: number; lines: string[] }>; truncated: boolean };

const MAX_FETCH_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 350_000;
const MAX_DOCX_BLOCKS = 220;
const MAX_SHEET_ROWS = 220;
const MAX_SHEET_COLS = 40;
const MAX_SHEETS = 8;
const MAX_SLIDES = 80;

export function fileNameFromUrl(url: string, fallback = 'Fayl'): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const segment = parsed.pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : fallback;
  } catch {
    const clean = url.split('?')[0].split('#')[0];
    const segment = clean.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : fallback;
  }
}

export function fileExtension(nameOrUrl: string): string {
  const clean = nameOrUrl.split('?')[0].split('#')[0];
  const base = clean.split('/').pop() || clean;
  const index = base.lastIndexOf('.');
  return index >= 0 ? base.slice(index + 1).toLowerCase() : '';
}

export function documentPreviewKind(nameOrUrl: string, mimeType?: string | null): DocumentPreviewKind {
  const ext = fileExtension(nameOrUrl);
  const mime = (mimeType || '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (ext === 'xlsx' || ext === 'xlsm' || mime.includes('spreadsheetml')) return 'xlsx';
  if (ext === 'csv' || mime === 'text/csv') return 'csv';
  if (ext === 'md' || ext === 'markdown' || mime === 'text/markdown') return 'markdown';
  if (ext === 'json' || mime.includes('json')) return 'json';
  if (ext === 'xml' || mime.includes('xml')) return 'xml';
  if (ext === 'txt' || ext === 'log' || ext === 'rtf' || mime.startsWith('text/')) return 'text';
  if (ext === 'pptx' || mime.includes('presentationml')) return 'pptx';
  return 'unsupported';
}

export function documentTypeLabel(kind: DocumentPreviewKind, extension?: string): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'docx') return 'DOCX';
  if (kind === 'xlsx') return 'XLSX';
  if (kind === 'csv') return 'CSV';
  if (kind === 'markdown') return 'Markdown';
  if (kind === 'json') return 'JSON';
  if (kind === 'xml') return 'XML';
  if (kind === 'text') return 'Matn';
  if (kind === 'pptx') return 'PPTX';
  return extension ? extension.toUpperCase() : 'Fayl';
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function xmlDocument(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Hujjat XML formatini o‘qib bo‘lmadi');
  return doc;
}

function elementsByLocalName(root: ParentNode, localName: string): Element[] {
  return Array.from((root as Document | Element).getElementsByTagNameNS('*', localName));
}

function nodeText(root: ParentNode, localName = 't'): string {
  return elementsByLocalName(root, localName)
    .map((node) => node.textContent || '')
    .join('');
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error('Faylni preview uchun yuklab bo‘lmadi (' + response.status + ')');

  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_FETCH_BYTES) {
    throw new Error('Bu fayl ichki preview uchun juda katta. Uni yangi oynada oching yoki yuklab oling.');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_FETCH_BYTES) {
    throw new Error('Bu fayl ichki preview uchun juda katta. Uni yangi oynada oching yoki yuklab oling.');
  }
  return new Uint8Array(buffer);
}

function truncateText(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_TEXT_CHARS) return { text: value, truncated: false };
  return { text: value.slice(0, MAX_TEXT_CHARS), truncated: true };
}

function parseDocx(bytes: Uint8Array): LoadedDocumentPreview {
  const archive = unzipSync(bytes);
  const file = archive['word/document.xml'];
  if (!file) throw new Error('DOCX tarkibida document.xml topilmadi');

  const document = xmlDocument(decode(file));
  const body = elementsByLocalName(document, 'body')[0];
  if (!body) return { kind: 'docx', blocks: [], truncated: false };

  const blocks: DocxBlock[] = [];
  let truncated = false;

  for (const child of Array.from(body.children)) {
    if (blocks.length >= MAX_DOCX_BLOCKS) {
      truncated = true;
      break;
    }

    if (child.localName === 'p') {
      const text = nodeText(child).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const styleNode = elementsByLocalName(child, 'pStyle')[0];
      const style =
        styleNode?.getAttribute('w:val') ??
        styleNode?.getAttribute('val') ??
        null;
      blocks.push({ type: 'paragraph', text, style });
      continue;
    }

    if (child.localName === 'tbl') {
      const rows = elementsByLocalName(child, 'tr')
        .slice(0, 60)
        .map((row) =>
          elementsByLocalName(row, 'tc')
            .slice(0, 20)
            .map((cell) => nodeText(cell).replace(/\s+/g, ' ').trim()),
        );
      if (rows.length > 0) blocks.push({ type: 'table', rows });
    }
  }

  return { kind: 'docx', blocks, truncated };
}

function sharedStrings(archive: Record<string, Uint8Array>): string[] {
  const file = archive['xl/sharedStrings.xml'];
  if (!file) return [];
  const document = xmlDocument(decode(file));
  return elementsByLocalName(document, 'si').map((item) => nodeText(item));
}

function columnIndex(reference: string): number {
  const letters = (reference.match(/[A-Z]+/i)?.[0] || '').toUpperCase();
  let result = 0;
  for (const char of letters) result = result * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, result - 1);
}

function worksheetRows(xml: string, strings: string[]): { rows: string[][]; truncated: boolean } {
  const document = xmlDocument(xml);
  const sourceRows = elementsByLocalName(document, 'row');
  const rows: string[][] = [];
  let truncated = sourceRows.length > MAX_SHEET_ROWS;

  for (const row of sourceRows.slice(0, MAX_SHEET_ROWS)) {
    const values: string[] = [];

    for (const cell of elementsByLocalName(row, 'c')) {
      const ref = cell.getAttribute('r') || '';
      const col = Math.min(columnIndex(ref), MAX_SHEET_COLS - 1);
      if (columnIndex(ref) >= MAX_SHEET_COLS) {
        truncated = true;
        continue;
      }

      const type = cell.getAttribute('t');
      let value = '';

      if (type === 'inlineStr') {
        value = nodeText(cell);
      } else {
        const raw = elementsByLocalName(cell, 'v')[0]?.textContent || '';
        if (type === 's') value = strings[Number(raw)] ?? raw;
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
        else value = raw;
      }

      while (values.length <= col) values.push('');
      values[col] = value;
    }

    rows.push(values.slice(0, MAX_SHEET_COLS));
  }

  return { rows, truncated };
}

function parseXlsx(bytes: Uint8Array): LoadedDocumentPreview {
  const archive = unzipSync(bytes);
  const strings = sharedStrings(archive);
  const workbookFile = archive['xl/workbook.xml'];
  const relsFile = archive['xl/_rels/workbook.xml.rels'];
  const sheets: SpreadsheetSheet[] = [];

  const fallbackPaths = Object.keys(archive)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort((a, b) => {
      const an = Number(a.match(/sheet(\d+)/)?.[1] || 0);
      const bn = Number(b.match(/sheet(\d+)/)?.[1] || 0);
      return an - bn;
    });

  if (!workbookFile || !relsFile) {
    for (const [index, path] of fallbackPaths.slice(0, MAX_SHEETS).entries()) {
      const parsed = worksheetRows(decode(archive[path]), strings);
      sheets.push({ name: 'Sheet ' + (index + 1), ...parsed });
    }
    return { kind: 'xlsx', sheets };
  }

  const workbook = xmlDocument(decode(workbookFile));
  const rels = xmlDocument(decode(relsFile));
  const relMap = new Map<string, string>();

  for (const rel of Array.from(rels.documentElement.children)) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) {
      const normalized = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      relMap.set(id, normalized.replace('xl/xl/', 'xl/'));
    }
  }

  const sheetElements = elementsByLocalName(workbook, 'sheet').slice(0, MAX_SHEETS);
  sheetElements.forEach((sheet, index) => {
    const name = sheet.getAttribute('name') || 'Sheet ' + (index + 1);
    const relId =
      sheet.getAttribute('r:id') ??
      sheet.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      );
    const path = (relId && relMap.get(relId)) || fallbackPaths[index];
    const file = path ? archive[path] : undefined;
    if (!file) return;

    const parsed = worksheetRows(decode(file), strings);
    sheets.push({ name, ...parsed });
  });

  return { kind: 'xlsx', sheets };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      result.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  result.push(value);
  return result;
}

function parseCsv(text: string): LoadedDocumentPreview {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const truncated = lines.length > MAX_SHEET_ROWS;
  const rows = lines
    .slice(0, MAX_SHEET_ROWS)
    .map(parseCsvLine)
    .map((row) => row.slice(0, MAX_SHEET_COLS));

  return {
    kind: 'csv',
    sheets: [{ name: 'CSV', rows, truncated }],
  };
}

function parsePptx(bytes: Uint8Array): LoadedDocumentPreview {
  const archive = unzipSync(bytes);
  const paths = Object.keys(archive)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const an = Number(a.match(/slide(\d+)/)?.[1] || 0);
      const bn = Number(b.match(/slide(\d+)/)?.[1] || 0);
      return an - bn;
    });

  const slides = paths.slice(0, MAX_SLIDES).map((path, index) => {
    const document = xmlDocument(decode(archive[path]));
    const lines = elementsByLocalName(document, 't')
      .map((node) => (node.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 80);
    return { number: index + 1, lines };
  });

  return {
    kind: 'pptx',
    slides,
    truncated: paths.length > MAX_SLIDES,
  };
}

export async function loadDocumentPreview(
  url: string,
  kind: Exclude<DocumentPreviewKind, 'pdf' | 'unsupported'>,
): Promise<LoadedDocumentPreview> {
  const bytes = await fetchBytes(url);

  if (kind === 'docx') return parseDocx(bytes);
  if (kind === 'xlsx') return parseXlsx(bytes);
  if (kind === 'pptx') return parsePptx(bytes);

  const raw = decode(bytes);
  if (kind === 'csv') return parseCsv(raw);

  if (kind === 'json') {
    try {
      const pretty = JSON.stringify(JSON.parse(raw), null, 2);
      const clipped = truncateText(pretty);
      return { kind, ...clipped };
    } catch {
      const clipped = truncateText(raw);
      return { kind, ...clipped };
    }
  }

  const clipped = truncateText(raw);
  return { kind, ...clipped };
}
