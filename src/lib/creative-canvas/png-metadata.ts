const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export const LV_EXPORT_PROVENANCE = {
  author: "LV Branding",
  developer: "Luis Velasquez",
  creator: "LV Branding Creative Canvas",
} as const;

export function exportProvenance(title: string): Record<string, string> {
  return {
    Title: title,
    Author: LV_EXPORT_PROVENANCE.author,
    Developer: LV_EXPORT_PROVENANCE.developer,
    Software: LV_EXPORT_PROVENANCE.creator,
    Provenance: `Created by ${LV_EXPORT_PROVENANCE.author}; Creative Canvas developed by ${LV_EXPORT_PROVENANCE.developer}.`,
  };
}

let crcTable: Uint32Array | undefined;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  const table = getCrcTable();
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function latin1(value: string) {
  return Uint8Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 255 ? code : 63;
  });
}

function textChunk(keyword: string, value: string) {
  const type = latin1("tEXt");
  const data = concat([latin1(keyword.replaceAll("\0", "")), new Uint8Array([0]), latin1(value.replaceAll("\0", ""))]);
  return concat([uint32(data.length), type, data, uint32(crc32(concat([type, data])))]);
}

/** Adds searchable PNG tEXt chunks immediately before IEND. */
export async function embedPngMetadata(blob: Blob, metadata: Record<string, string>) {
  const png = new Uint8Array(await blob.arrayBuffer());
  if (png.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((byte, index) => png[index] !== byte)) {
    throw new Error("Export metadata can only be added to a PNG image.");
  }

  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0, false);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error("The exported PNG is incomplete.");
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === "IEND") {
      const chunks = Object.entries(metadata).map(([key, value]) => textChunk(key.slice(0, 79), value));
      return new Blob([concat([png.subarray(0, offset), ...chunks, png.subarray(offset)])], { type: "image/png" });
    }
    offset = end;
  }

  throw new Error("The exported PNG has no end marker.");
}
