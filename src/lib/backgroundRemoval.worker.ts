/** Runs the background removal model off the main thread: BiRefNet lite (MIT) on WebGPU. */
import { AutoModel, AutoProcessor, RawImage, env, type Tensor } from "@huggingface/transformers";

const MODEL = "onnx-community/BiRefNet_lite-ONNX";
env.allowLocalModels = false;

type Request = { id: number; image: Blob; width: number; height: number };
type Loaded = { model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>; processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> };

let loading: Promise<Loaded> | null = null;

function load(id: number): Promise<Loaded> {
  loading ??= (async () => {
    const progress_callback = (info: { status: string; file?: string; progress?: number }) => {
      if (info.status === "progress" && info.file?.endsWith(".onnx")) postMessage({ id, type: "progress", percent: Math.round(info.progress ?? 0) });
    };
    type Adapter = { features: Iterable<string>; limits: Record<string, number>; requestDevice(options: unknown): Promise<unknown> };
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu;
    // Some browsers never answer this, so it gets a time limit.
    const adapter = await Promise.race([gpu?.requestAdapter().catch(() => null), new Promise<null>((resolve) => setTimeout(resolve, 3000, null))]);
    // The model's fixed 1024px input runs out of memory on the CPU (WASM) path, so WebGPU is required.
    if (!adapter) throw new Error("이 브라우저에서는 사용할 수 없습니다. 최신 Chrome이나 Edge에서 사용해 주세요.");
    // The default WebGPU device has lower limits than this model's shaders need; ask for what the hardware offers.
    const requiredLimits: Record<string, number> = {};
    for (const key in adapter.limits) requiredLimits[key] = adapter.limits[key]!;
    const device = await adapter.requestDevice({ requiredFeatures: [...adapter.features], requiredLimits });
    (env.backends.onnx as unknown as { webgpu: Record<string, unknown> }).webgpu = { ...(env.backends.onnx as unknown as { webgpu?: Record<string, unknown> }).webgpu, adapter, device };
    const processor = await AutoProcessor.from_pretrained(MODEL);
    return { processor, model: await AutoModel.from_pretrained(MODEL, { dtype: "fp16", device: "webgpu", progress_callback }) };
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

// One image at a time: the model can't run two requests at once.
let queue: Promise<unknown> = Promise.resolve();

async function run({ id, image, width, height }: Request) {
  try {
    const { model, processor } = await load(id);
    postMessage({ id, type: "working" });
    const picture = await RawImage.fromBlob(image);
    const { pixel_values } = await processor(picture);
    const { output_image } = (await model({ input_image: pixel_values })) as unknown as { output_image: Tensor[] };
    const mask = await RawImage.fromTensor(output_image[0]!.sigmoid().mul(255).to("uint8")).resize(width, height);
    const alpha = new Uint8ClampedArray(width * height);
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = mask.data[i * mask.channels]!;
    postMessage({ id, type: "done", alpha }, { transfer: [alpha.buffer] });
  } catch (error) {
    postMessage({ id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

self.onmessage = (event: MessageEvent<Request>) => {
  queue = queue.then(() => run(event.data));
};
