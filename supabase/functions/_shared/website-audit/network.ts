/** Pure IP classification used before every outbound website-audit fetch. */
export function parseIpv4(value: string): number[] | null {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.some((part) => part > 255) ? null : parts;
}

export function isBlockedIpv4(value: string): boolean {
  const parts = parseIpv4(value);
  if (!parts) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224;
}

function ipv6Words(value: string): number[] | null {
  let host = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host.includes("%")) return null;

  if (host.includes(".")) {
    const separator = host.lastIndexOf(":");
    const ipv4 = separator >= 0 ? parseIpv4(host.slice(separator + 1)) : null;
    if (!ipv4) return null;
    host = `${host.slice(0, separator)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const halves = host.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const tokens = half.split(":");
    if (tokens.some((token) => !/^[\da-f]{1,4}$/.test(token))) return null;
    return tokens.map((token) => Number.parseInt(token, 16));
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  if (left.length + right.length >= 8) return null;
  return [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
}

export function isBlockedIpv6(value: string): boolean {
  const words = ipv6Words(value);
  if (!words) return true;
  const [a, b, c, d, e, f, g, h] = words;
  const allBeforeLastZero = words.slice(0, 7).every((word) => word === 0);
  if (words.every((word) => word === 0) || (allBeforeLastZero && h === 1)) return true;

  // IPv4-mapped addresses must inherit the embedded IPv4 classification.
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) {
    return isBlockedIpv4(`${g >> 8}.${g & 255}.${h >> 8}.${h & 255}`);
  }
  // Deprecated compatible/translated forms are rejected instead of trying to
  // infer how each downstream network stack will interpret them.
  if ((a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0) ||
      (a === 0 && b === 0 && c === 0 && d === 0 && e === 0xffff)) return true;

  if ((a & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
  if ((a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0) return true; // link/site-local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return true; // discard-only 100::/64
  if (a === 0x0064 && b === 0xff9b) return true; // NAT64 translation prefixes
  if (a === 0x2002) return true; // 6to4 embeds an IPv4 destination
  if (a === 0x2001 && b === 0x0000) return true; // Teredo
  if (a === 0x2001 && b === 0x0002 && c === 0) return true; // benchmarking
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  if (a === 0x2001 && ((b & 0xfff0) === 0x0010 || (b & 0xfff0) === 0x0020)) return true; // ORCHID
  if ((a & 0xfff0) === 0x3ff0) return true; // documentation 3fff::/20
  // IANA currently allocates ordinary global unicast addresses from 2000::/3.
  // Default closed so future/unallocated space (for example 4000::/3 and the
  // reserved portion of fe00::/9) cannot become an SSRF destination merely
  // because it was not enumerated above.
  return (a & 0xe000) !== 0x2000;
}
