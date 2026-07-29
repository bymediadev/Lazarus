import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import path from "path";

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const ACCEPTED_EXT = new Set([".pdf", ".docx"]);
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

export interface ExtractedDocument {
  text: string;
  filename: string;
  kind: "pdf" | "docx";
}

function extensionOf(filename: string): string {
  const ext = path.extname(filename || "").toLowerCase();
  return ext;
}

export function isAcceptedDocument(filename: string, mimeType?: string): boolean {
  const ext = extensionOf(filename);
  if (ACCEPTED_EXT.has(ext)) return true;
  if (mimeType && ACCEPTED_MIME.has(mimeType)) return true;
  return false;
}

export function documentKind(filename: string, mimeType?: string): "pdf" | "docx" | null {
  const ext = extensionOf(filename);
  if (ext === ".pdf" || mimeType === "application/pdf") return "pdf";
  if (
    ext === ".docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    return "docx";
  }
  return null;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text ?? "").trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return (result.value ?? "").trim();
}

/** Extract plain text from an in-memory PDF or DOCX. Does not persist the file. */
export async function extractDocumentText(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ExtractedDocument> {
  if (buffer.byteLength > DOCUMENT_MAX_BYTES) {
    throw new Error(`Document exceeds ${DOCUMENT_MAX_BYTES / (1024 * 1024)} MB limit.`);
  }

  const kind = documentKind(filename, mimeType);
  if (!kind) {
    throw new Error("Unsupported document type. Use .pdf or .docx.");
  }

  const text = kind === "pdf" ? await extractPdf(buffer) : await extractDocx(buffer);
  if (!text) {
    throw new Error("Document contained no extractable text.");
  }

  return { text, filename: filename || `upload.${kind}`, kind };
}
