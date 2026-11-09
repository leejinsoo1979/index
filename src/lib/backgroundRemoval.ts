/**
 * 배경 제거: the image never leaves the browser. The model (about 109MB) downloads once from
 * Hugging Face and stays in the browser's cache.
 */
const MAX_SIDE = 2400;

type Reply = { id: number } & ({ type: "progress"; percent: number } | { type: "working" } | { type: "done"; alpha: Uint8ClampedArray } | { type: "error"; message: string });
type Job = { onStatus: (status: string) => void; resolve: (alpha: Uint8ClampedArray) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let nextId = 0;
const jobs = new Map<number, Job>();

function modelWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./backgroundRemoval.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = ({ data }: MessageEvent<Reply>) => {
    const job = jobs.get(data.id);
    if (!job) return;
    if (data.type === "progress") job.onStatus(`처음 한 번 준비 중… ${data.percent}%`);
    else if (data.type === "working") job.onStatus("배경 지우는 중…");
    else {
      jobs.delete(data.id);
      if (data.type === "done") job.resolve(data.alpha);
      else job.reject(new Error(`배경을 지우지 못했습니다: ${data.message}`));
    }
  };
  created.onerror = () => {
    jobs.forEach((job) => job.reject(new Error("배경 제거 모델을 실행하지 못했습니다.")));
    jobs.clear();
    worker = null;
  };
  worker = created;
  return created;
}

/** The same picture with its background made transparent. */
export async function removeBackground(src: string, onStatus: (status: string) => void): Promise<Blob> {
  const response = await fetch(src).catch(() => null);
  if (!response?.ok) throw new Error("이 사진을 불러오지 못해 배경을 지울 수 없습니다.");
  const image = await response.blob();
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const alpha = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      const id = (nextId += 1);
      jobs.set(id, { onStatus, resolve, reject });
      modelWorker().postMessage({ id, image, width, height });
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진을 처리하지 못했습니다.");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    for (let i = 0; i < alpha.length; i += 1) pixels.data[i * 4 + 3] = Math.min(pixels.data[i * 4 + 3]!, alpha[i]!);
    context.putImageData(pixels, 0, 0);
    // WebP keeps transparency and is small; browsers that can't encode it return PNG, which also does.
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!result) throw new Error("결과 이미지를 만들지 못했습니다.");
    return result;
  } finally {
    bitmap.close();
  }
}
