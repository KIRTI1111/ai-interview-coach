import "server-only";

import { MAX_FILE_BYTES, MAX_FILE_MEGABYTES } from "@/lib/document-limits";

export { MAX_FILE_BYTES } from "@/lib/document-limits";
export const MAX_EXTRACTED_CHARACTERS = 100_000;

const allowedExtensions = new Set(["pdf", "txt", "docx"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]);

export class DocumentValidationError extends Error {}

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function hasPdfSignature(bytes: Uint8Array) {
  return new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

function hasZipSignature(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function normalizeText(value: string) {
  return value.replace(/\0/g, "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

export async function extractDocument(file: File) {
  const extension = extensionOf(file.name);
  if (!allowedExtensions.has(extension)) throw new DocumentValidationError("Use a PDF, TXT, or DOCX file.");
  if (!allowedMimeTypes.has(file.type || "application/octet-stream")) throw new DocumentValidationError("The file type does not match an allowed document format.");
  if (file.size === 0) throw new DocumentValidationError("The selected file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new DocumentValidationError(`The file is larger than the ${MAX_FILE_MEGABYTES} MB deployment-safe limit.`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  try {
    if (extension === "pdf") {
      if (!hasPdfSignature(bytes)) throw new DocumentValidationError("This file does not have a valid PDF signature.");
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: bytes });
      try {
        text = (await parser.getText({ pageJoiner: "" })).text;
      } finally {
        await parser.destroy();
      }
    } else if (extension === "docx") {
      if (!hasZipSignature(bytes)) throw new DocumentValidationError("This file does not have a valid DOCX signature.");
      const { default: mammoth } = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } else {
      if (bytes.includes(0)) throw new DocumentValidationError("This TXT file appears to contain binary data.");
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    const diagnostic = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown parser error";
    console.error(`[document-extraction:${extension}] ${diagnostic}`);
    throw new DocumentValidationError("We could not read this document. It may be damaged, encrypted, or use an unsupported encoding.");
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    throw new DocumentValidationError(extension === "pdf" ? "No selectable text was found. This may be a scanned PDF that needs OCR." : "No readable text was found in this document.");
  }
  if (normalized.length > MAX_EXTRACTED_CHARACTERS) throw new DocumentValidationError("The extracted text exceeds the 100,000 character limit.");

  return { text: normalized, characters: normalized.length, filename: file.name.slice(0, 180), format: extension.toUpperCase() };
}
