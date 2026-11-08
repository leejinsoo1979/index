/**
 * Admin image uploads for site content (게시판 대표 이미지, 세미나, 업체 로고, 페이지 문구 이미지 …).
 *
 * Files go to Firebase Storage `siteImages/{folder}/…` (storage.rules: public read, admin write,
 * image/* up to 5MB). Photos are scaled down to 1600px and saved as JPEG; PNG/WebP keep their
 * format so logos keep transparency. Without Firebase (local demo) the image is returned as a
 * data URL. Errors come back as plain Korean messages the screens can show as-is.
 */
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebaseStorage, isFirebaseConfigured } from "./firebase";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export class ImageUploadError extends Error {
  /** true when Storage isn't set up yet (no bucket) — the screen offers pasting a URL instead */
  constructor(message: string, readonly storageMissing = false) {
    super(message);
  }
}

function scale(file: File, maxSize: number): Promise<{ blob: Blob; type: string; ext: string }> {
  const keep = file.type === "image/png" || file.type === "image/webp";
  const type = keep ? file.type : "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  if (file.type === "image/svg+xml" || file.type === "image/gif") return Promise.resolve({ blob: file, type: file.type, ext: file.type === "image/gif" ? "gif" : "svg" });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve({ blob, type, ext }) : reject(new ImageUploadError("이미지를 변환하지 못했습니다."))), type, 0.86);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageUploadError("이미지 파일을 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

export async function uploadSiteImage(file: File, folder: string, maxSize = 1600): Promise<string> {
  if (!file.type.startsWith("image/")) throw new ImageUploadError("이미지 파일만 올릴 수 있습니다.");
  const { blob, type, ext } = await scale(file, maxSize);
  if (blob.size > MAX_IMAGE_BYTES) throw new ImageUploadError("이미지가 5MB를 넘습니다. 더 작은 파일을 골라 주세요.");

  if (!isFirebaseConfigured || !firebaseStorage) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new ImageUploadError("이미지를 읽을 수 없습니다."));
      reader.readAsDataURL(blob);
    });
  }

  // Fail fast instead of retrying for minutes when the bucket doesn't exist yet.
  firebaseStorage.maxUploadRetryTime = 15_000;
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, "").replace(/^\/+|\/+$/g, "") || "misc";
  const path = `siteImages/${safeFolder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const target = ref(firebaseStorage, path);
  try {
    await uploadBytes(target, blob, { contentType: type, cacheControl: "public,max-age=31536000" });
    return await getDownloadURL(target);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (code === "storage/bucket-not-found" || code === "storage/retry-limit-exceeded" || code === "storage/unknown" || code === "storage/project-not-found")
      throw new ImageUploadError("이미지 저장소(Firebase Storage)가 아직 만들어지지 않았습니다. Firebase 콘솔 › Storage에서 '시작하기'를 누른 뒤 다시 올려 주세요. 그 전에는 이미지 주소를 붙여 넣어 쓸 수 있습니다.", true);
    if (code === "storage/unauthorized") throw new ImageUploadError("업로드 권한이 없습니다. 관리자 계정으로 로그인했는지, 저장소 규칙이 배포됐는지 확인해 주세요.");
    if (code === "storage/canceled") throw new ImageUploadError("업로드를 취소했습니다.");
    throw new ImageUploadError(`이미지를 올리지 못했습니다: ${(err as Error).message}`);
  }
}
