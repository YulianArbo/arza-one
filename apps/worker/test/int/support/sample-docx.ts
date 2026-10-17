import { crc32 } from 'node:zlib';

// Un .docx mínimo armado en memoria (B18): un ZIP sin compresión con las tres partes que Word y
// LibreOffice necesitan. Así la prueba no guarda archivos binarios ni agrega bibliotecas.

interface ZipEntry {
  readonly name: Buffer;
  readonly data: Buffer;
  readonly crc: number;
  readonly offset: number;
}

const PARTS: readonly (readonly [string, string])[] = [
  [
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  ],
  [
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  ],
];

function documentXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
}

function localHeader(entry: ZipEntry): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(entry.name.length, 26);
  return Buffer.concat([header, entry.name, entry.data]);
}

function centralHeader(entry: ZipEntry): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([header, entry.name]);
}

function endRecord(count: number, size: number, offset: number): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  return record;
}

/** Un Word con un párrafo de texto. */
export function sampleDocx(text = 'Procedimiento de prueba'): Buffer {
  const files = [...PARTS, ['word/document.xml', documentXml(text)] as const];
  const entries: ZipEntry[] = [];
  const locals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content);
    const entry = { name: Buffer.from(name), data, crc: crc32(data), offset };
    const local = localHeader(entry);
    entries.push(entry);
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(entries.map(centralHeader));
  return Buffer.concat([...locals, central, endRecord(entries.length, central.length, offset)]);
}
