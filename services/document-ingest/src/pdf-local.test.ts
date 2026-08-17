import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { ingest } from "./index.ts";
import { parseLocalPdf } from "./pdf-local.ts";

function plainPdf(text: string): Uint8Array {
  const body = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  return Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n%%EOF\n`, "latin1");
}

function flatePdf(text: string): Uint8Array {
  const body = Buffer.from(`BT (${text}) Tj ET`, "latin1");
  const compressed = deflateSync(body);
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
    compressed,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);
}

describe("bounded local PDF parser", () => {
  test("extracts literal text from a bounded text PDF", () => {
    const result = parseLocalPdf(plainPdf("hello\\nworld"));
    expect(result.state).toBe("PASS");
    expect(result.text).toBe("hello\nworld");
  });

  test("extracts text from a FlateDecode stream", () => {
    const result = parseLocalPdf(flatePdf("compressed"));
    expect(result.state).toBe("PASS");
    expect(result.text).toBe("compressed");
  });

  test("rejects malformed non-PDF input", () => {
    const result = parseLocalPdf(Buffer.from("not a pdf"));
    expect(result.state).toBe("FAIL");
    expect(result.detail).toContain("header");
  });

  test("keeps encrypted PDFs explicitly unsupported", () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF\n", "latin1");
    const result = parseLocalPdf(bytes);
    expect(result.state).toBe("NOT_IMPLEMENTED");
    expect(result.detail).toContain("encrypted");
  });

  test("does not promote image-only PDFs to text PASS", () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /DCTDecode >>\nstream\nJPEG\nendstream\nendobj\n%%EOF\n", "latin1");
    const result = parseLocalPdf(bytes);
    expect(result.state).toBe("NOT_IMPLEMENTED");
    expect(result.detail).toContain("image stream");
  });

  test("does not silently accept unknown stream filters", () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /LZWDecode >>\nstream\nabc\nendstream\nendobj\n%%EOF\n", "latin1");
    const result = parseLocalPdf(bytes);
    expect(result.state).toBe("NOT_IMPLEMENTED");
    expect(result.detail).toContain("unsupported PDF stream filter");
  });

  test("ingest emits input and extracted-text digests for local PDF PASS", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-shield-pdf-"));
    try {
      const path = join(root, "fixture.pdf");
      writeFileSync(path, plainPdf("receipt"));
      const receipt = ingest({ path, mediaType: "application/pdf", provider: "local" });
      expect(receipt.state).toBe("PASS");
      expect(receipt.artifacts.map((artifact) => artifact.kind)).toEqual(["pdf-input", "pdf-text"]);
      expect(receipt.detail).toContain("bounded PDF text parser");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
