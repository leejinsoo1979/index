import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Brush, Check, Image as ImageIcon, LoaderCircle, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { getDownloadURL, list, ref, uploadBytes } from "firebase/storage";
import { createAgentId, type AgentImageAsset, type AgentStudioData } from "../../lib/agentStudioStore";
import { firebaseStorage } from "../../lib/firebase";
import { agentAuthorizedFetch } from "../../lib/agentApi";

const CANVAS_W = 720;
const CANVAS_H = 480;

async function persistImage(userId: string, assetId: string, versionId: string, value: string) {
  if (!value.startsWith("data:")) return value;
  if (!firebaseStorage) throw new Error("Firebase Storage 버킷 설정이 필요합니다. VITE_FIREBASE_STORAGE_BUCKET을 설정하세요.");
  const [header, payload] = value.split(",", 2);
  const mime = header.match(/^data:([^;]+)/)?.[1] || "image/png";
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  const extension = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : "png";
  const objectRef = ref(firebaseStorage, `agent-studio/${userId}/${assetId}/${versionId}.${extension}`);
  await uploadBytes(objectRef, bytes, { contentType: mime });
  return getDownloadURL(objectRef);
}

async function ensureStorageReady(userId: string) {
  if (!firebaseStorage) throw new Error("Firebase Storage 설정이 필요합니다.");
  try {
    await list(ref(firebaseStorage, `agent-studio/${userId}`), { maxResults: 1 });
  } catch {
    throw new Error("Firebase Storage 버킷 또는 보안 규칙이 아직 준비되지 않았습니다. Storage를 활성화한 뒤 규칙을 배포하세요.");
  }
}

export default function ImageLab({ userId, data, onUpdateData, onInsertImage, initialPrompt = "" }: {
  userId: string;
  data: AgentStudioData;
  onUpdateData: (updater: (current: AgentStudioData) => AgentStudioData) => void;
  onInsertImage?: (src: string, caption: string) => void;
  initialPrompt?: string;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [size, setSize] = useState("1024x1024");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editAsset, setEditAsset] = useState<AgentImageAsset | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: CANVAS_W, height: CANVAS_H });
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasMaskRef = useRef(false);

  useEffect(() => {
    if (!editAsset) return;
    const overlay = overlayRef.current?.getContext("2d");
    const mask = maskRef.current?.getContext("2d");
    overlay?.clearRect(0, 0, canvasSize.width, canvasSize.height);
    if (mask) { mask.globalCompositeOperation = "source-over"; mask.fillStyle = "#000"; mask.fillRect(0, 0, canvasSize.width, canvasSize.height); }
    hasMaskRef.current = false;
  }, [canvasSize, editAsset]);

  const requestImage = async (body: Record<string, unknown>) => {
    const response = await agentAuthorizedFetch("/api/agent-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, userId }) });
    const result = await response.json() as { imageDataUrl?: string; model?: string; error?: string };
    if (!response.ok || !result.imageDataUrl) throw new Error(result.error || "이미지 생성에 실패했습니다.");
    return result;
  };

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await ensureStorageReady(userId);
      const result = await requestImage({ action: "generate", prompt: prompt.trim(), size });
      const assetId = createAgentId();
      const versionId = createAgentId();
      const imageUrl = await persistImage(userId, assetId, versionId, result.imageDataUrl!);
      const asset: AgentImageAsset = { id: assetId, title: prompt.trim().slice(0, 54), prompt: prompt.trim(), model: result.model || "gpt-image-1", createdAt: new Date().toISOString(), versions: [{ id: versionId, dataUrl: imageUrl, prompt: prompt.trim(), createdAt: new Date().toISOString() }] };
      onUpdateData((current) => ({ ...current, images: [asset, ...current.images] }));
      setPrompt("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "이미지 생성에 실패했습니다."); } finally { setBusy(false); }
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const overlay = overlayRef.current;
    const maskCanvas = maskRef.current;
    if (!overlay || !maskCanvas) return;
    const rect = overlay.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * overlay.width;
    const y = ((event.clientY - rect.top) / rect.height) * overlay.height;
    const visual = overlay.getContext("2d");
    const mask = maskCanvas.getContext("2d");
    if (!visual || !mask) return;
    visual.fillStyle = "rgba(124,58,237,.48)"; visual.beginPath(); visual.arc(x, y, 25, 0, Math.PI * 2); visual.fill();
    mask.globalCompositeOperation = "destination-out"; mask.beginPath(); mask.arc(x, y, 25, 0, Math.PI * 2); mask.fill();
    hasMaskRef.current = true;
  }

  function resetMask() {
    const overlay = overlayRef.current?.getContext("2d"); const mask = maskRef.current?.getContext("2d");
    const width = overlayRef.current?.width ?? CANVAS_W;
    const height = overlayRef.current?.height ?? CANVAS_H;
    overlay?.clearRect(0, 0, width, height);
    if (mask) { mask.globalCompositeOperation = "source-over"; mask.fillStyle = "#000"; mask.fillRect(0, 0, width, height); }
    hasMaskRef.current = false;
  }

  async function inpaint(event: FormEvent) {
    event.preventDefault();
    const latest = editAsset?.versions.at(-1);
    if (!editAsset || !latest || !editPrompt.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await ensureStorageReady(userId);
      const result = await requestImage({ action: "inpaint", prompt: editPrompt.trim(), size, ...(latest.dataUrl.startsWith("data:") ? { imageDataUrl: latest.dataUrl } : { imageUrl: latest.dataUrl }), maskDataUrl: hasMaskRef.current ? maskRef.current?.toDataURL("image/png") : undefined });
      const versionId = createAgentId();
      const imageUrl = await persistImage(userId, editAsset.id, versionId, result.imageDataUrl!);
      onUpdateData((current) => ({ ...current, images: current.images.map((asset) => asset.id === editAsset.id ? { ...asset, versions: [...asset.versions, { id: versionId, dataUrl: imageUrl, prompt: editPrompt.trim(), createdAt: new Date().toISOString() }] } : asset) }));
      setEditAsset((current) => current ? { ...current, versions: [...current.versions, { id: versionId, dataUrl: imageUrl, prompt: editPrompt.trim(), createdAt: new Date().toISOString() }] } : null);
      setEditPrompt(""); resetMask();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "이미지 수정에 실패했습니다."); } finally { setBusy(false); }
  }

  return <div className="agent-image-lab">
    <form className="agent-image-lab__prompt" onSubmit={generate}><div><Sparkles /><span><strong>AI 이미지 생성</strong><small>gpt-image-1 · 생성본과 수정 버전을 함께 보관합니다.</small></span></div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} placeholder="공간, 재료, 조명, 카메라 구도를 자세히 설명하세요" /><footer><select value={size} onChange={(event) => setSize(event.target.value)}><option value="1024x1024">정사각형</option><option value="1536x1024">가로형</option><option value="1024x1536">세로형</option></select><button type="submit" disabled={!prompt.trim() || busy}>{busy ? <LoaderCircle /> : <Plus />} 생성</button></footer></form>
    {error && <p className="agent-image-lab__error">{error}</p>}
    <div className="agent-image-grid">{data.images.length ? data.images.map((asset) => { const latest = asset.versions.at(-1); return <article key={asset.id}>{latest ? <img src={latest.dataUrl} alt={asset.title} /> : <div><ImageIcon /></div>}<section><strong>{asset.title}</strong><small>{asset.model} · 버전 {asset.versions.length}</small><footer><button type="button" onClick={() => setEditAsset(asset)}><Brush /> 인페인트</button>{latest && onInsertImage && <button type="button" onClick={() => onInsertImage(latest.dataUrl, asset.title)}><Check /> 문서에 삽입</button>}</footer></section></article>; }) : <div className="agent-empty"><ImageIcon /><strong>생성한 이미지가 없습니다.</strong><p>첫 번째 공간 이미지를 생성해보세요.</p></div>}</div>
    {editAsset && <div className="agent-inpaint-modal"><div><header><div><strong>이미지 인페인트</strong><small>보라색으로 수정할 영역을 칠한 뒤 변경 내용을 입력하세요.</small></div><button type="button" onClick={() => setEditAsset(null)}><X /></button></header><div className="agent-inpaint-canvas" style={{ aspectRatio: `${canvasSize.width}/${canvasSize.height}` }}>{editAsset.versions.at(-1) && <img src={editAsset.versions.at(-1)!.dataUrl} alt="수정 전" onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setCanvasSize({ width: image.naturalWidth, height: image.naturalHeight }); }} />}<canvas ref={overlayRef} width={canvasSize.width} height={canvasSize.height} onPointerDown={(event) => { drawingRef.current = true; draw(event); }} onPointerMove={draw} onPointerUp={() => { drawingRef.current = false; }} onPointerLeave={() => { drawingRef.current = false; }} /><canvas ref={maskRef} width={canvasSize.width} height={canvasSize.height} hidden /></div><button className="agent-inpaint-reset" type="button" onClick={resetMask}><RotateCcw /> 마스크 지우기</button><form onSubmit={inpaint}><input value={editPrompt} onChange={(event) => setEditPrompt(event.target.value)} placeholder="예: 벽면 타일을 베이지톤 대형 포세린으로 변경" /><button type="submit" disabled={!editPrompt.trim() || busy}>{busy ? <LoaderCircle /> : <Brush />} 수정 생성</button></form></div></div>}
  </div>;
}
