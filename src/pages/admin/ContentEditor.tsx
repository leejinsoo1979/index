/**
 * Generic form for admin-editable content blocks (siteContent). Walks a JSON value:
 * strings → text fields, numbers → number fields, booleans → checkbox, objects → labelled groups,
 * arrays → item cards with add / remove / move. New array items copy the shape of the first item.
 * Field names get Korean labels from FIELD_LABELS; unknown keys show as-is.
 */
import type { ReactNode } from "react";
import ImageField from "../../components/admin/ImageField";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const FIELD_LABELS: Record<string, string> = {
  eyebrow: "작은 머리글",
  title: "제목",
  titleAccent: "제목 강조(파란 글씨)",
  titleTail: "제목 끝",
  lead: "설명",
  body: "본문",
  statement: "문장",
  statementAccent: "문장 강조",
  primary: "버튼",
  label: "버튼 글자",
  to: "링크 주소",
  pillars: "약속 항목",
  no: "번호",
  en: "영문",
  items: "카드",
  image: "이미지",
  logo: "로고",
  imageAlt: "이미지 설명(대체 텍스트)",
  tag: "분류",
  more: "더보기 글자",
  keywords: "카드 위 단어",
  words: "키워드 (단어, 크기 1~5)",
};

const labelOf = (key: string) => FIELD_LABELS[key] ?? key;

function blank(sample: Json): Json {
  if (typeof sample === "string") return "";
  if (typeof sample === "number") return 1;
  if (typeof sample === "boolean") return false;
  if (Array.isArray(sample)) return sample.length ? [blank(sample[0])] : [];
  if (sample && typeof sample === "object") return Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, blank(v)]));
  return "";
}

function TextField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const long = value.length > 60 || value.includes("\n");
  return (
    <label className="ce-field">
      {label && <span>{label}</span>}
      {long ? (
        <textarea value={value} rows={Math.min(8, Math.max(2, Math.ceil(value.length / 70) + value.split("\n").length - 1))} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

export function ContentEditor({ value, onChange, label, depth = 0 }: { value: Json; onChange: (v: Json) => void; label?: string; depth?: number }): ReactNode {
  // Image fields (key 'image' or 'logo') get the shared uploader instead of a text box.
  if (typeof value === "string" && (label === labelOf("image") || label === labelOf("logo")))
    return <ImageField folder="pages" label={label} value={value} onChange={onChange} fit={label === labelOf("logo") ? "contain" : "cover"} />;
  if (typeof value === "string") return <TextField value={value} onChange={onChange} label={label} />;
  if (typeof value === "number")
    return (
      <label className="ce-field ce-field--short">
        {label && <span>{label}</span>}
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
      </label>
    );
  if (typeof value === "boolean")
    return (
      <label className="ce-check">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    );
  if (value === null) return <p className="ce-empty">{label}: 없음</p>;

  if (Array.isArray(value)) {
    const set = (i: number, v: Json) => onChange(value.map((x, j) => (j === i ? v : x)));
    const move = (i: number, d: number) => {
      const j = i + d;
      if (j < 0 || j >= value.length) return;
      const next = [...value];
      [next[i], next[j]] = [next[j], next[i]];
      onChange(next);
    };
    // A short tuple like ["단어", 3] reads best on one line.
    const inline = value.every((x) => typeof x !== "object" || (Array.isArray(x) && x.every((y) => typeof y !== "object")));
    return (
      <fieldset className={`ce-list${inline ? " ce-list--inline" : ""}`}>
        {label && <legend>{label} <small>{value.length}개</small></legend>}
        {value.map((item, i) => (
          <div className="ce-item" key={i}>
            <div className="ce-item__body">
              <ContentEditor value={item} onChange={(v) => set(i, v)} depth={depth + 1} />
            </div>
            <div className="ce-item__tools">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="아래로">↓</button>
              <button type="button" className="is-danger" onClick={() => window.confirm("이 항목을 삭제할까요?") && onChange(value.filter((_, j) => j !== i))} aria-label="삭제">삭제</button>
            </div>
          </div>
        ))}
        <button type="button" className="ce-add" onClick={() => onChange([...value, value.length ? blank(value[0]) : ""])}>+ 항목 추가</button>
      </fieldset>
    );
  }

  const entries = Object.entries(value);
  const set = (k: string, v: Json) => onChange({ ...value, [k]: v });
  return (
    <div className={`ce-group${depth ? " ce-group--nested" : ""}`}>
      {label && depth > 0 && <p className="ce-group__label">{label}</p>}
      {entries.map(([k, v]) => (
        <ContentEditor key={k} value={v} onChange={(nv) => set(k, nv)} label={labelOf(k)} depth={depth + 1} />
      ))}
    </div>
  );
}
