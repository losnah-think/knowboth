import { mapConcurrent } from "@/lib/async";
import { messages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

/** Extract locally. The caller explicitly decides whether text is sent for analysis. */
export async function extractResumeText(file: File, locale: Locale): Promise<string> {
  const copy = messages[locale];
  if (file.size > 8 * 1024 * 1024) throw new Error(copy.fileTooLarge);
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["pdf", "docx", "txt", "md"].includes(ext || "")) throw new Error(copy.fileUnsupported);
  const bytes = await file.arrayBuffer();
  let text = "";
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
    const loading = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
    try {
      const document = await loading.promise;
      if (document.numPages > 40) throw new Error(copy.pdfTooLong);
      const pages = await mapConcurrent(
        Array.from({ length: document.numPages }, (_, index) => index),
        4,
        async (index) => {
          const page = await document.getPage(index + 1);
          try {
            const content = await page.getTextContent();
            return content.items
              .map((item) =>
                "str" in item ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}` : "",
              )
              .join("");
          } finally {
            page.cleanup();
          }
        },
      );
      text = pages.join("\n\n");
    } finally {
      await loading.destroy();
    }
  } else if (ext === "docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ arrayBuffer: bytes })).value;
  } else if (ext === "txt" || ext === "md") text = new TextDecoder().decode(bytes);
  else throw new Error(copy.fileUnsupported);
  if (!text.trim()) throw new Error(copy.fileEmpty);
  return text.trim();
}
