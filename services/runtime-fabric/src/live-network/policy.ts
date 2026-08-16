const SHA256 = /^[a-f0-9]{64}$/;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const PROXY_ENV = /^(?:http|https|all|no)_proxy$/i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function isSha256(value: string): boolean {
  return SHA256.test(value);
}

export function canonicalHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function looksLikeIp(host: string): boolean {
  const value = canonicalHost(host);
  return IPV4.test(value) || value.includes(":");
}

export function isValidHostname(host: string): boolean {
  const value = canonicalHost(host);
  if (!value || value.length > 253 || looksLikeIp(value) || value.includes("@") || value.includes("://")) return false;
  const labels = value.split(".");
  return labels.length >= 2 && labels.every((label) => LABEL.test(label));
}

function forbiddenIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

function forbiddenIpv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith("ff")) return true;
  if (value.startsWith("2001:db8:")) return true;
  if (value.startsWith("::ffff:")) {
    const tail = value.slice("::ffff:".length);
    return !IPV4.test(tail) || forbiddenIpv4(tail);
  }
  return false;
}

export function isForbiddenResolvedAddress(address: string): boolean {
  const value = address.trim().toLowerCase();
  if (IPV4.test(value)) return forbiddenIpv4(value);
  if (value.includes(":")) return forbiddenIpv6(value);
  return true;
}

export function activeProxyVariables(environment: Record<string, string | undefined>): string[] {
  return Object.entries(environment)
    .filter(([key, value]) => PROXY_ENV.test(key) && typeof value === "string" && value.trim().length > 0)
    .map(([key]) => key)
    .sort();
}

export function destinationKey(host: string, port: number): string {
  return `${canonicalHost(host)}:${port}`;
}
