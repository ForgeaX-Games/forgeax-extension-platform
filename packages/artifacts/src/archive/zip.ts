import { ArtifactError } from './error';

export interface ArchiveEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_HEADER = 0x06054b50;

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..') && !path.includes('node_modules/') && path !== 'install.js' && !path.endsWith('/install.js');
}

function ensureEntries(entries: readonly ArchiveEntry[]): ArchiveEntry[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!validPath(entry.path) || seen.has(entry.path)) throw new ArtifactError({ code: 'FXE_ARCHIVE_ENTRY_INVALID', phase: 'pack', message: `Invalid archive entry: ${entry.path}`, hint: 'Use unique relative paths without traversal, node_modules, or install scripts.' });
    seen.add(entry.path);
  }
  return [...entries].sort((a, b) => a.path.localeCompare(b.path));
}

export function createDeterministicZip(input: readonly ArchiveEntry[]): Uint8Array {
  const entries = ensureEntries(input);
  const encoded = entries.map((entry) => ({ ...entry, name: new TextEncoder().encode(entry.path), crc: crc32(entry.data) }));
  const localSize = encoded.reduce((total, entry) => total + 30 + entry.name.length + entry.data.length, 0);
  const centralSize = encoded.reduce((total, entry) => total + 46 + entry.name.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let offset = 0;
  const localOffsets: number[] = [];
  for (const entry of encoded) {
    localOffsets.push(offset);
    view.setUint32(offset, LOCAL_HEADER, true); view.setUint16(offset + 4, 20, true); view.setUint16(offset + 6, 0, true); view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, 0, true); view.setUint16(offset + 12, 0, true); view.setUint32(offset + 14, entry.crc, true); view.setUint32(offset + 18, entry.data.length, true); view.setUint32(offset + 22, entry.data.length, true); view.setUint16(offset + 26, entry.name.length, true); view.setUint16(offset + 28, 0, true); offset += 30;
    output.set(entry.name, offset); offset += entry.name.length; output.set(entry.data, offset); offset += entry.data.length;
  }
  const centralOffset = offset;
  encoded.forEach((entry, index) => {
    view.setUint32(offset, CENTRAL_HEADER, true); view.setUint16(offset + 4, 20, true); view.setUint16(offset + 6, 20, true); view.setUint16(offset + 8, 0, true); view.setUint16(offset + 10, 0, true); view.setUint16(offset + 12, 0, true); view.setUint16(offset + 14, 0, true); view.setUint32(offset + 16, entry.crc, true); view.setUint32(offset + 20, entry.data.length, true); view.setUint32(offset + 24, entry.data.length, true); view.setUint16(offset + 28, entry.name.length, true); view.setUint16(offset + 30, 0, true); view.setUint16(offset + 32, 0, true); view.setUint16(offset + 34, 0, true); view.setUint16(offset + 36, 0, true); view.setUint32(offset + 38, 0, true); view.setUint32(offset + 42, localOffsets[index] ?? 0, true); offset += 46;
    output.set(entry.name, offset); offset += entry.name.length;
  });
  view.setUint32(offset, END_HEADER, true); view.setUint16(offset + 4, 0, true); view.setUint16(offset + 6, 0, true); view.setUint16(offset + 8, encoded.length, true); view.setUint16(offset + 10, encoded.length, true); view.setUint32(offset + 12, centralSize, true); view.setUint32(offset + 16, centralOffset, true); view.setUint16(offset + 20, 0, true);
  return output;
}

export function readDeterministicZip(bytes: Uint8Array): ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(bytes.length - 22, true) !== END_HEADER) throw new ArtifactError({ code: 'FXE_ARCHIVE_INVALID', phase: 'verify', message: 'FXE is not a supported ZIP archive', hint: 'Rebuild the artifact with the ForgeaX Extension SDK.' });
  const count = view.getUint16(bytes.length - 22 + 8, true); const centralSize = view.getUint32(bytes.length - 22 + 12, true); const centralOffset = view.getUint32(bytes.length - 22 + 16, true);
  if (centralOffset + centralSize > bytes.length - 22) throw new ArtifactError({ code: 'FXE_ARCHIVE_INVALID', phase: 'verify', message: 'FXE central directory exceeds archive bounds', hint: 'Restore the locked artifact and retry verification.' });
  const entries: ArchiveEntry[] = []; let offset = centralOffset; const seen = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_HEADER) throw new ArtifactError({ code: 'FXE_ARCHIVE_INVALID', phase: 'verify', message: 'FXE central directory entry is invalid', hint: 'Restore the locked artifact and retry verification.' });
    const flags = view.getUint16(offset + 8, true); const method = view.getUint16(offset + 10, true); const compressedSize = view.getUint32(offset + 20, true); const uncompressedSize = view.getUint32(offset + 24, true); const nameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true); const localOffset = view.getUint32(offset + 42, true); const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength)); offset += 46 + nameLength + extraLength + commentLength;
    if (flags !== 0 || method !== 0 || !validPath(name) || seen.has(name) || localOffset + 30 > bytes.length) throw new ArtifactError({ code: 'FXE_ARCHIVE_ENTRY_INVALID', phase: 'verify', message: `Unsupported or unsafe FXE entry: ${name}`, hint: 'Use a deterministic store-only archive with unique safe paths.' });
    const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true); const start = localOffset + 30 + localNameLength + localExtraLength; const end = start + compressedSize;
    if (end > bytes.length || compressedSize !== uncompressedSize) throw new ArtifactError({ code: 'FXE_ARCHIVE_INVALID', phase: 'verify', message: `FXE entry is truncated: ${name}`, hint: 'Restore the locked artifact and retry verification.' });
    entries.push({ path: name, data: bytes.slice(start, end) }); seen.add(name);
  }
  return entries;
}
