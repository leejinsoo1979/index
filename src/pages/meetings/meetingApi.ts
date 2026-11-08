import type { User } from "firebase/auth";

export type MeetingKind = "general" | "executive" | "site";
export type Participant = { name: string; role?: string; personaId?: string };
export type Segment = { start: number; end: number; speaker: string; text: string };
export type Tone = "높음" | "보통" | "낮음";
export type Analysis = {
  summary: string[];
  decisions: { text: string; by: string }[];
  actions: { task: string; owner: string; due: string; note: string }[];
  carryOver: { task: string; owner: string; status: string; note: string }[];
  issues: { text: string; severity: Tone }[];
  nextAgenda: string[];
  site: { requirementChanges: string[]; specChanges: string[]; costs: { item: string; amount: string; note: string }[]; scheduleChanges: string[]; defects: string[] };
  people: { name: string; stance: string; points: string[]; concerns: string[] }[];
  relations: { from: string; to: string; type: string; note: string }[];
  followUps: { tool: string; reason: string }[];
};
export type MeetingSummary = {
  id: string;
  title: string;
  kind: MeetingKind;
  date: string;
  participants: Participant[];
  status: "queued" | "transcribing" | "analyzing" | "ready" | "error";
  stage: string;
  progress: number;
  error?: string;
  duration?: number;
  createdAt: string;
  saved: { wiki?: string | boolean; personas?: Record<string, string> };
};
export type Meeting = MeetingSummary & {
  speakers: Record<string, number>;
  diarized: boolean;
  warning: string;
  analysisError: string;
  previousId: string;
  audio: { mime: string; size: number };
  transcript: { duration: number; diarized: boolean; segments: Segment[] } | null;
  analysis: Analysis | null;
  queuePosition: number;
};
export type Health = { ok: boolean; engine: boolean; diarization: boolean; llm: boolean; busy: boolean; queued: number };

export const KIND_LABEL: Record<MeetingKind, string> = { general: "일반 회의", executive: "임원 회의", site: "현장·고객 미팅" };

export async function meetingFetch<T>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  const res = await fetch(`/api/meetings${path}`, { ...init, headers: { ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers, Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `요청을 처리하지 못했습니다 (${res.status}).`);
  return body as T;
}

export async function meetingAudio(user: User, id: string): Promise<string> {
  const token = await user.getIdToken();
  const res = await fetch(`/api/meetings/${id}/audio`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("녹음 파일을 불러오지 못했습니다.");
  return URL.createObjectURL(await res.blob());
}

const utf8Base64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** Upload with progress (fetch has no upload progress). */
export function uploadMeeting(
  token: string,
  audio: Blob,
  info: { title: string; kind: MeetingKind; date: string; participants: Participant[]; previousId?: string },
  onProgress: (pct: number) => void,
): Promise<Meeting> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/meetings");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", (audio.type || "audio/webm").split(";")[0]);
    xhr.setRequestHeader("X-Meeting", utf8Base64(JSON.stringify(info)));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* keep null */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Meeting);
      else reject(new Error((body as { error?: string } | null)?.error || `올리지 못했습니다 (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("회의록 서버에 연결하지 못했습니다."));
    xhr.send(audio);
  });
}

export const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(sec).padStart(2, "0");
};

export const speakerLabel = (label: string) => `화자 ${Number(label.replace("SPEAKER_", "")) + 1}`;
export function speakerName(m: Pick<Meeting, "speakers" | "participants">, label: string) {
  const i = m.speakers[label];
  return i != null && i >= 0 && m.participants[i] ? m.participants[i].name : speakerLabel(label);
}
