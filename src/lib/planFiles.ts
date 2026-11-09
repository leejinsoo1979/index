/** Turns a drawing the admin picked (PDF page or image) into a JPEG small enough for one function request. */
export type PlanJpeg = { image: string; width: number; height: number; pages?: number };

const MAX_DATA_URL = 3_500_000;
const SIDES = [2800, 2200, 1700];

export async function renderPdfPage(data: ArrayBuffer, pageNumber: number): Promise<PlanJpeg & { pages: number }> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  try {
    const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    for (const side of SIDES) {
      const viewport = page.getViewport({ scale: side / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PDF를 그리지 못했습니다.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const image = canvas.toDataURL("image/jpeg", 0.9);
      if (image.length <= MAX_DATA_URL) return { image, width: canvas.width, height: canvas.height, pages: doc.numPages };
    }
    throw new Error("도면 페이지가 너무 복잡해서 변환하지 못했습니다.");
  } finally {
    await doc.destroy();
  }
}

export async function imageToPlanJpeg(file: File): Promise<PlanJpeg> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이미지를 처리하지 못했습니다.");
      context.fillStyle = "#fff"; // JPEG has no alpha
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.9);
      if (image.length <= MAX_DATA_URL) return { image, width: canvas.width, height: canvas.height };
    }
    throw new Error("이미지가 너무 큽니다.");
  } finally {
    bitmap.close();
  }
}
