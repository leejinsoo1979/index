/**
 * Files attached in the INDEX AI chat. Everything is prepared in the browser so a request stays
 * under the 4.5MB Vercel function limit: images are downscaled to JPEG data URLs, documents are
 * reduced to their text. Nothing is uploaded or stored — attachments live for the open session.
 */
export type ChatAttachment = {
  id: string;
  name: string;
  kind: "image" | "file";
  /** image: data:image/jpeg;base64,… */
  dataUrl?: string;
  /** file: extracted text */
  text?: string;
};

export const MAX_ATTACHMENTS = 4;
export const CHAT_ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,.pdf,.txt,.md";

const MAX_IMAGE_SIDE = 1600;
/** Base64 length per image; four of these still fit in one function request. */
const MAX_IMAGE_CHARS = 900_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 40_000;

async function imageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name}: 이미지를 읽지 못했습니다.`);
  });
  try {
    let side = MAX_IMAGE_SIDE;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이미지를 처리하지 못했습니다.");
      // JPEG has no alpha: transparent floor plans and screenshots go on white, not black.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
      if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
      side = Math.round(side * 0.75);
    }
    throw new Error(`${file.name}: 이미지가 너무 큽니다.`);
  } finally {
    bitmap.close();
  }
}

async function pdfToText(file: File): Promise<string> {
  const [{ PDFParse }, { default: workerUrl }] = await Promise.all([
    import("pdf-parse"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  PDFParse.setWorker(workerUrl);
  const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

export async function readChatAttachment(file: File): Promise<ChatAttachment> {
  const id = crypto.randomUUID();
  if (file.type.startsWith("image/")) {
    return { id, name: file.name || "붙여넣은 이미지", kind: "image", dataUrl: await imageToDataUrl(file) };
  }
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: 20MB 이하 파일만 첨부할 수 있습니다.`);
  const lower = file.name.toLowerCase();
  let text: string;
  if (lower.endsWith(".pdf")) text = await pdfToText(file);
  else if (lower.endsWith(".txt") || lower.endsWith(".md")) text = await file.text();
  else throw new Error(`${file.name}: 이미지, PDF, TXT, Markdown만 첨부할 수 있습니다.`);
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error(`${file.name}: 글자를 찾지 못했습니다. 스캔본이면 페이지를 이미지로 첨부해 주세요.`);
  return { id, name: file.name, kind: "file", text: text.slice(0, MAX_TEXT_CHARS) };
}
