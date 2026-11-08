import { generateText } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { deepseekModel } from "../../api/_deepseek.ts";

/**
 * Meeting analysis for 회의록 AI: summary, decisions, to-dos, risks, interior site checks
 * (요구 변경·사양 변경·추가 비용·일정·하자), who-said-what per participant and the relations
 * between participants (used for the executives' "관계 기억").
 */

export type Line = { start: number; end: number; speaker: string; name: string; text: string };
export type Participant = { name: string; role?: string; personaId?: string };
export type Action = { task: string; owner: string; due: string; note: string };
export type MeetingAnalysis = {
  summary: string[];
  decisions: { text: string; by: string }[];
  actions: Action[];
  carryOver: { task: string; owner: string; status: "완료" | "진행 중" | "미언급" | "취소"; note: string }[];
  issues: { text: string; severity: "높음" | "보통" | "낮음" }[];
  nextAgenda: string[];
  site: { requirementChanges: string[]; specChanges: string[]; costs: { item: string; amount: string; note: string }[]; scheduleChanges: string[]; defects: string[] };
  people: { name: string; stance: string; points: string[]; concerns: string[] }[];
  relations: { from: string; to: string; type: "합의" | "이견" | "요청" | "지원" | "보고" | "질문" | "위임"; note: string }[];
  followUps: { tool: "work-permit" | "quote-review" | "defect-period" | "company-check"; reason: string }[];
};

export const hasMeetingModel = () => Boolean(process.env.DEEPSEEK_API_KEY?.trim() || process.env.CHAT_LLM_BASE_URL?.trim() || process.env.OPENAI_API_KEY?.trim());

function model() {
  if (process.env.DEEPSEEK_API_KEY?.trim() && (process.env.CHAT_AI_PROVIDER === "deepseek" || !process.env.OPENAI_API_KEY)) return deepseekModel(process.env.MEETINGS_MODEL || "deepseek-v4-pro");
  const baseURL = process.env.CHAT_LLM_BASE_URL?.trim();
  if (baseURL && !process.env.OPENAI_API_KEY) return createOpenAI({ baseURL, apiKey: process.env.CHAT_LLM_API_KEY || "local", name: "local" }).chat(process.env.CHAT_LLM_MODEL?.trim() || "qwen3.5:27b");
  return openai(process.env.OPENAI_MODEL_HEAVY || "gpt-5.4-mini");
}

const KIND = { general: "일반 회의", executive: "INDEX 임원 회의", site: "인테리어 현장·고객 미팅" } as Record<string, string>;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const SHAPE = `{
  "summary": ["세 줄 요약, 각 줄 한 문장"],
  "decisions": [{"text": "결정된 내용", "by": "결정·제안한 사람 이름 또는 빈 문자열"}],
  "actions": [{"task": "할 일", "owner": "담당자 이름(참석자 이름 그대로) 또는 빈 문자열", "due": "YYYY-MM-DD 또는 '다음 회의 전' 같은 표현, 없으면 빈 문자열", "note": "조건·메모"}],
  "carryOver": [{"task": "지난 회의 할 일", "owner": "", "status": "완료|진행 중|미언급|취소", "note": "근거"}],
  "issues": [{"text": "쟁점·위험·미해결 사항", "severity": "높음|보통|낮음"}],
  "nextAgenda": ["다음 회의에서 다룰 안건"],
  "site": {"requirementChanges": ["고객 요구 변경"], "specChanges": ["자재·사양 변경"], "costs": [{"item": "항목", "amount": "금액 표현 그대로", "note": "누가 부담·확정 여부"}], "scheduleChanges": ["일정 변경"], "defects": ["하자·민원 언급"]},
  "people": [{"name": "참석자 이름", "stance": "이 회의에서의 입장 한 문장", "points": ["발언 요지"], "concerns": ["우려"]}],
  "relations": [{"from": "이름", "to": "이름", "type": "합의|이견|요청|지원|보고|질문|위임", "note": "무엇에 대해 어떻게"}],
  "followUps": [{"tool": "work-permit|quote-review|defect-period|company-check", "reason": "이 도구로 확인할 필요가 있는 이유"}]
}`;

function system(kind: string, participants: Participant[], diarized: boolean) {
  const names = participants.map((p) => p.name + (p.role ? `(${p.role})` : "")).join(", ") || "알 수 없음";
  return [
    `당신은 주거 실내건축 전문가 단체 INDEX의 회의록 담당자다. ${KIND[kind] ?? "회의"} 녹취록을 읽고 정확한 회의록을 만든다.`,
    `참석자: ${names}.`,
    diarized ? "각 줄 앞의 이름은 화자 분리 결과다. 드물게 틀릴 수 있으니 맥락이 명백히 다르면 맥락을 따른다." : "화자 분리가 되지 않은 녹취록이다. 발언자를 단정하지 말고, 말 속에 이름·직함이 드러날 때만 사람을 특정한다.",
    "규칙: 녹취록에 없는 내용을 지어내지 않는다. 금액·날짜·수량·자재명은 들린 그대로 옮긴다. 음성 인식 오류로 보이는 단어는 문맥상 명백할 때만 바로잡는다.",
    "담당자·관계의 이름은 반드시 참석자 이름을 그대로 쓴다. 관계(relations)는 실제로 오간 요청·합의·이견·보고만 적는다.",
    kind === "site" ? "현장 체크(site) 항목을 특히 꼼꼼히 채운다. 추가 비용은 누가 부담하는지와 확정 여부를 note에 적는다." : "현장 관련 언급이 없으면 site의 배열은 비워 둔다.",
    "followUps: 비내력벽 철거·확장·발코니·설비 변경 등 허가가 걸릴 공사가 나오면 work-permit, 견적·금액 다툼은 quote-review, 하자 책임 문제는 defect-period, 업체 신뢰 문제는 company-check.",
    "해당 없는 배열은 []로 둔다. 반드시 아래 모양의 JSON 객체 하나만 출력한다. 설명이나 코드블록 표시는 쓰지 않는다.",
    SHAPE,
  ].join("\n");
}

async function ask<T>(sys: string, prompt: string, maxOutputTokens = 6000): Promise<T> {
  const { text } = await generateText({ model: model(), system: sys, prompt, maxOutputTokens, abortSignal: AbortSignal.timeout(240_000) });
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("모델이 JSON을 돌려주지 않았습니다.");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function normalise(raw: Partial<MeetingAnalysis>, participants: Participant[]): MeetingAnalysis {
  const names = new Set(participants.map((p) => p.name));
  const who = (v: unknown) => { const s = str(v, 60); return names.size === 0 || names.has(s) ? s : [...names].find((n) => s.includes(n)) ?? s; };
  const site = (raw.site ?? {}) as Partial<MeetingAnalysis["site"]>;
  return {
    summary: arr<string>(raw.summary).map((s) => str(s)).filter(Boolean).slice(0, 5),
    decisions: arr<{ text: string; by: string }>(raw.decisions).map((d) => ({ text: str(d?.text), by: who(d?.by) })).filter((d) => d.text),
    actions: arr<Action>(raw.actions).map((a) => ({ task: str(a?.task), owner: who(a?.owner), due: str(a?.due, 40), note: str(a?.note) })).filter((a) => a.task),
    carryOver: arr<MeetingAnalysis["carryOver"][number]>(raw.carryOver).map((c) => ({ task: str(c?.task), owner: who(c?.owner), status: (["완료", "진행 중", "미언급", "취소"].includes(c?.status) ? c.status : "미언급") as MeetingAnalysis["carryOver"][number]["status"], note: str(c?.note) })).filter((c) => c.task),
    issues: arr<MeetingAnalysis["issues"][number]>(raw.issues).map((i) => ({ text: str(i?.text), severity: (["높음", "보통", "낮음"].includes(i?.severity) ? i.severity : "보통") as MeetingAnalysis["issues"][number]["severity"] })).filter((i) => i.text),
    nextAgenda: arr<string>(raw.nextAgenda).map((s) => str(s)).filter(Boolean),
    site: {
      requirementChanges: arr<string>(site.requirementChanges).map((s) => str(s)).filter(Boolean),
      specChanges: arr<string>(site.specChanges).map((s) => str(s)).filter(Boolean),
      costs: arr<{ item: string; amount: string; note: string }>(site.costs).map((c) => ({ item: str(c?.item), amount: str(c?.amount, 80), note: str(c?.note) })).filter((c) => c.item),
      scheduleChanges: arr<string>(site.scheduleChanges).map((s) => str(s)).filter(Boolean),
      defects: arr<string>(site.defects).map((s) => str(s)).filter(Boolean),
    },
    people: arr<MeetingAnalysis["people"][number]>(raw.people).map((p) => ({ name: who(p?.name), stance: str(p?.stance), points: arr<string>(p?.points).map((s) => str(s)).filter(Boolean), concerns: arr<string>(p?.concerns).map((s) => str(s)).filter(Boolean) })).filter((p) => p.name),
    relations: arr<MeetingAnalysis["relations"][number]>(raw.relations).map((r) => ({ from: who(r?.from), to: who(r?.to), type: (["합의", "이견", "요청", "지원", "보고", "질문", "위임"].includes(r?.type) ? r.type : "요청") as MeetingAnalysis["relations"][number]["type"], note: str(r?.note) })).filter((r) => r.from && r.to && r.from !== r.to && r.note),
    followUps: arr<MeetingAnalysis["followUps"][number]>(raw.followUps).filter((f) => ["work-permit", "quote-review", "defect-period", "company-check"].includes(f?.tool)).map((f) => ({ tool: f.tool, reason: str(f.reason) })),
  };
}

const CHUNK = 60_000;

export async function analyseMeeting(input: { title: string; kind: string; date: string; participants: Participant[]; lines: Line[]; diarized: boolean; previousActions: Action[] }): Promise<MeetingAnalysis> {
  const body = input.lines.map((l) => `[${clock(l.start)}] ${l.name}: ${l.text}`).join("\n");
  const head = `회의 제목: ${input.title}\n날짜: ${input.date}\n`;
  const carry = input.previousActions.length
    ? `\n지난 회의에서 정한 할 일(각각 이번 회의에서 어떻게 되었는지 carryOver에 적는다):\n${input.previousActions.map((a) => `- ${a.task} (${a.owner || "담당 미정"}${a.due ? `, ${a.due}` : ""})`).join("\n")}\n`
    : "\n지난 회의 할 일이 없으므로 carryOver는 []로 둔다.\n";
  const sys = system(input.kind, input.participants, input.diarized);
  if (body.length <= CHUNK * 1.5) return normalise(await ask<Partial<MeetingAnalysis>>(sys, `${head}${carry}\n녹취록:\n${body}`), input.participants);

  // Long meetings: extract per part, then merge the parts into one record.
  const parts: string[] = [];
  let cur = "";
  for (const line of body.split("\n")) { if (cur.length + line.length > CHUNK && cur) { parts.push(cur); cur = ""; } cur += line + "\n"; }
  if (cur) parts.push(cur);
  const partials: Partial<MeetingAnalysis>[] = [];
  for (const [i, part] of parts.entries()) partials.push(await ask<Partial<MeetingAnalysis>>(sys, `${head}이 녹취록은 전체 ${parts.length}부분 중 ${i + 1}번째다. 이 부분에 나온 내용만 정리한다. carryOver는 []로 둔다.\n\n녹취록:\n${part}`));
  return normalise(await ask<Partial<MeetingAnalysis>>(sys, `${head}${carry}\n아래는 같은 회의를 ${parts.length}부분으로 나눠 정리한 결과다. 중복을 합치고 흐름 순서대로 하나의 회의록 JSON으로 만든다. 세 줄 요약은 회의 전체를 대상으로 다시 쓴다.\n\n${JSON.stringify(partials)}`, 8000), input.participants);
}
