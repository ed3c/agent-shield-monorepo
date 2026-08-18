import { inflateSync } from "node:zlib";

export type LocalPdfState = "PASS" | "FAIL" | "NOT_IMPLEMENTED";

export interface LocalPdfParseResult {
  state: LocalPdfState;
  text: string;
  detail: string;
}

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_STREAMS = 256;
const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_DECODED_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;

function decodePdfLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let j = 0; j < 2 && /[0-7]/.test(raw[i + 1] ?? ""); j += 1) octal += raw[++i];
      out += String.fromCharCode(Number.parseInt(octal, 8));
    } else if (next === "\r" && raw[i + 1] === "\n") i += 1;
    else if (next === "\n" || next === "\r") {
      // PDF line continuation contributes no character.
    } else out += next;
  }
  return out;
}

function decodeHexString(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  const padded = compact.length % 2 === 0 ? compact : `${compact}0`;
  if (!/^[0-9A-Fa-f]*$/.test(padded)) return "";
  return Buffer.from(padded, "hex").toString("latin1");
}

function extractTextOperators(content: string): string[] {
  const text: string[] = [];
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? [];
  for (const block of blocks) {
    for (const match of block.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) text.push(decodePdfLiteral(match[1] ?? ""));
    for (const match of block.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) text.push(decodeHexString(match[1] ?? ""));
    for (const arrayMatch of block.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      const body = arrayMatch[1] ?? "";
      for (const match of body.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) text.push(decodePdfLiteral(match[1] ?? ""));
      for (const match of body.matchAll(/<([0-9A-Fa-f\s]+)>/g)) text.push(decodeHexString(match[1] ?? ""));
    }
  }
  return text.filter(Boolean);
}

function dictionaryBefore(raw: string, streamIndex: number): string {
  const end = raw.lastIndexOf(">>", streamIndex);
  if (end < 0 || streamIndex - end > 1024) return "";
  const start = raw.lastIndexOf("<<", end);
  if (start < 0 || end - start > 4096) return "";
  return raw.slice(start, end + 2);
}

function decodeStream(dict: string, bytes: Uint8Array): LocalPdfParseResult {
  const filters = [...dict.matchAll(/\/Filter\s*(?:\[\s*)?\/([A-Za-z0-9]+)/g)].map((match) => match[1]);
  if (filters.length === 0) {
    return { state: "PASS", text: Buffer.from(bytes).toString("latin1"), detail: "unfiltered stream" };
  }
  const filter = filters[0];
  if (filter === "FlateDecode") {
    try {
      const decoded = inflateSync(bytes);
      if (decoded.byteLength > MAX_STREAM_BYTES) return { state: "FAIL", text: "", detail: "decoded stream exceeds bound" };
      return { state: "PASS", text: decoded.toString("latin1"), detail: "FlateDecode stream" };
    } catch {
      return { state: "FAIL", text: "", detail: "FlateDecode stream is malformed" };
    }
  }
  if (["DCTDecode", "JPXDecode", "CCITTFaxDecode", "JBIG2Decode"].includes(filter ?? "")) {
    return { state: "NOT_IMPLEMENTED", text: "", detail: `image stream filter ${filter} is not a text source` };
  }
  return { state: "NOT_IMPLEMENTED", text: "", detail: `unsupported PDF stream filter ${filter}` };
}

export function parseLocalPdf(bytes: Uint8Array): LocalPdfParseResult {
  if (bytes.byteLength === 0) return { state: "FAIL", text: "", detail: "PDF input is empty" };
  if (bytes.byteLength > MAX_INPUT_BYTES) return { state: "FAIL", text: "", detail: "PDF input exceeds 16 MiB bound" };

  const raw = Buffer.from(bytes).toString("latin1");
  if (!raw.startsWith("%PDF-1.") && !raw.startsWith("%PDF-2.0")) return { state: "FAIL", text: "", detail: "missing supported PDF header" };
  if (/\/Encrypt\b/.test(raw)) return { state: "NOT_IMPLEMENTED", text: "", detail: "encrypted PDFs require an explicitly admitted decryptor" };

  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  if (streams.length > MAX_STREAMS) return { state: "FAIL", text: "", detail: "PDF stream count exceeds bound" };

  let decodedBytes = 0;
  const extracted: string[] = [];
  let unsupportedTextPath: string | null = null;

  for (const match of streams) {
    const streamRaw = match[1] ?? "";
    const streamBytes = Buffer.from(streamRaw, "latin1");
    if (streamBytes.byteLength > MAX_STREAM_BYTES) return { state: "FAIL", text: "", detail: "compressed stream exceeds bound" };
    const dict = dictionaryBefore(raw, match.index ?? 0);
    const decoded = decodeStream(dict, streamBytes);
    if (decoded.state === "FAIL") return decoded;
    if (decoded.state === "NOT_IMPLEMENTED") {
      unsupportedTextPath ??= decoded.detail;
      continue;
    }
    decodedBytes += Buffer.byteLength(decoded.text, "latin1");
    if (decodedBytes > MAX_TOTAL_DECODED_BYTES) return { state: "FAIL", text: "", detail: "decoded PDF content exceeds aggregate bound" };
    extracted.push(...extractTextOperators(decoded.text));
    if (extracted.reduce((sum, value) => sum + value.length, 0) > MAX_TEXT_CHARS) return { state: "FAIL", text: "", detail: "extracted PDF text exceeds bound" };
  }

  // Some tiny/simple PDFs place text operators outside a stream; support them without
  // treating arbitrary object text as content by requiring BT/ET operators.
  if (streams.length === 0) extracted.push(...extractTextOperators(raw));

  const text = extracted.join("\n").trim();
  if (!text) {
    if (unsupportedTextPath) return { state: "NOT_IMPLEMENTED", text: "", detail: unsupportedTextPath };
    return { state: "NOT_IMPLEMENTED", text: "", detail: "no supported text operators found; scanned/image-only or unsupported font encoding" };
  }
  return { state: "PASS", text, detail: `builtin bounded PDF text parser extracted ${text.length} characters` };
}
