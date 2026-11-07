import { isIP } from "node:net";

export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [a, b, c] = parts;
    if (parts.some((part) => part < 0 || part > 255)) return false;
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168))
      || (a === 192 && b === 88 && c === 99)
      || (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value.startsWith("::ffff:")) {
      const mapped = value.slice(7);
      return isIP(mapped) === 4 && isPublicAddress(mapped);
    }
    return /^(2|3)/.test(value)
      && !value.startsWith("2001:db8")
      && !value.startsWith("2001:0")
      && !value.startsWith("2002:");
  }
  return false;
}
