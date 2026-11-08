import { useEffect, useId, useRef, useState } from "react";
import { ImageUploadError, uploadSiteImage } from "../../lib/siteImages";
import "./ImageField.css";

/**
 * 관리자 공용 이미지 입력: 파일 올리기(드래그 또는 선택) · 미리보기 · 주소 붙여넣기 · 지우기.
 * Controlled (`value` + `onChange`) or uncontrolled inside a <form> (`name` + `defaultValue`;
 * a hidden input carries the URL into FormData).
 */
type Props = {
  folder: string;
  label?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (url: string) => void;
  hint?: string;
  /** contain = logos (whole image visible), cover = photos */
  fit?: "cover" | "contain";
};

export default function ImageField({ folder, label = "이미지", name, value, defaultValue = "", onChange, hint, fit = "cover" }: Props) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const url = controlled ? value : inner;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!controlled) setInner(defaultValue);
  }, [defaultValue, controlled]);

  const set = (next: string) => {
    if (!controlled) setInner(next);
    onChange?.(next);
  };

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      set(await uploadSiteImage(file, folder));
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지를 올리지 못했습니다.");
      if (e instanceof ImageUploadError && e.storageMissing) setShowUrl(true);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="image-field">
      <span className="image-field__label" id={`${id}-label`}>
        {label}
      </span>
      {name && <input type="hidden" name={name} value={url} />}
      <div
        className={`image-field__box${drag ? " is-drag" : ""}${url ? " has-image" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files?.[0]);
        }}
      >
        {url ? (
          <img src={url} alt="" className={`image-field__preview is-${fit}`} />
        ) : (
          <span className="image-field__empty">{busy ? "올리는 중…" : "이미지를 끌어다 놓거나 아래에서 고르세요"}</span>
        )}
        {busy && url && <span className="image-field__busy">올리는 중…</span>}
      </div>
      <div className="image-field__actions">
        <button type="button" className="admin-btn" disabled={busy} onClick={() => fileRef.current?.click()} aria-describedby={`${id}-label`}>
          {url ? "다른 이미지로 바꾸기" : "이미지 올리기"}
        </button>
        <button type="button" className="admin-btn" onClick={() => setShowUrl((v) => !v)}>
          주소로 넣기
        </button>
        {url && (
          <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={() => set("")}>
            지우기
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      {showUrl && (
        <input
          className="image-field__url"
          aria-label={`${label} 주소`}
          placeholder="https://… 또는 /images/…"
          value={url}
          onChange={(e) => set(e.target.value.trim())}
        />
      )}
      {error && <p className="image-field__error">{error}</p>}
      {hint && !error && <p className="image-field__hint">{hint}</p>}
    </div>
  );
}
