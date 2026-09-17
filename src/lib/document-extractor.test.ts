import { describe, expect, it } from "vitest";
import { DocumentValidationError, extractDocument, MAX_FILE_BYTES } from "@/lib/document-extractor";
import { MAX_FILE_MEGABYTES } from "@/lib/document-limits";

function pdfWithText(text: string) {
  const escapedText = text.replace(/([\\()])/g, "\\$1");
  const content = `BT /F1 18 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("secure document extraction", () => {
  it("extracts and normalizes a valid TXT document", async () => {
    const file = new File(["Java developer  \r\n\r\nSpring Boot"], "resume.txt", { type: "text/plain" });
    await expect(extractDocument(file)).resolves.toMatchObject({
      text: "Java developer\n\nSpring Boot",
      format: "TXT",
      filename: "resume.txt",
    });
  });

  it("rejects an unsupported extension", async () => {
    const file = new File(["resume"], "resume.exe", { type: "application/octet-stream" });
    await expect(extractDocument(file)).rejects.toThrow("Use a PDF, TXT, or DOCX file.");
  });

  it("rejects an empty document", async () => {
    const file = new File([], "resume.txt", { type: "text/plain" });
    await expect(extractDocument(file)).rejects.toThrow("empty");
  });

  it("rejects a fake PDF by its byte signature", async () => {
    const file = new File(["not a real PDF"], "resume.pdf", { type: "application/pdf" });
    await expect(extractDocument(file)).rejects.toThrow("valid PDF signature");
  });

  it("extracts selectable text from a valid PDF", async () => {
    const file = new File([pdfWithText("Java Spring Boot developer")], "resume.pdf", { type: "application/pdf" });
    await expect(extractDocument(file)).resolves.toMatchObject({
      text: "Java Spring Boot developer",
      format: "PDF",
      filename: "resume.pdf",
    });
  });

  it("rejects binary content disguised as TXT", async () => {
    const file = new File([new Uint8Array([65, 0, 66])], "resume.txt", { type: "text/plain" });
    await expect(extractDocument(file)).rejects.toThrow("binary data");
  });

  it("rejects files over the byte limit before parsing", async () => {
    const file = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "large.txt", { type: "text/plain" });
    await expect(extractDocument(file)).rejects.toBeInstanceOf(DocumentValidationError);
    await expect(extractDocument(file)).rejects.toThrow(`${MAX_FILE_MEGABYTES} MB deployment-safe limit`);
  });
});
