import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, type LanguageModel, type ModelMessage, type UserContent } from "ai";
import { deepseekModel } from "./_deepseek.js";
import { searchWiki } from "./_wiki.js";

/**
 * AI writing for flipbooks: look at the photos first, let the editor correct what the model saw,
 * then write from that. Facts the photos can't show come only from the editor's memo or the wiki.
 */
export const WRITING_STYLES: Record<string, string> = {
  magazine: "라이프스타일 매거진의 에디토리얼. 공간의 첫인상으로 시작해 장면을 따라가듯 쓴다. 문장은 짧고 리듬이 있으며 과장이 없다.",
  essay: "조용한 감성 에세이. 공간에서 보내는 하루의 한 순간을 1인칭에 가깝게 그린다. 형용사보다 장면과 감각으로 말한다.",
  case: "시공 사례 리포트. 공간 구성, 마감, 조명을 차례로 정리하고 왜 그렇게 했는지 설계 의도 위주로 설명한다. 담백하고 구체적으로 쓴다.",
  product: "제품 소개 카탈로그. 사진에 보이는 형태, 질감, 쓰임을 근거로 장점을 정리한다. 광고 문구처럼 부풀리지 않는다.",
  column: "실내건축 전문가의 칼럼. 비례, 동선, 재료, 빛의 관점에서 사진을 해석하고 실무적인 시사점으로 맺는다.",
  caption: "짧은 사진 캡션. 한두 문장으로 장면의 핵심만 쓴다.",
};

const LENGTHS: Record<string, string> = {
  short: "본문은 2문단, 200자 안팎.",
  medium: "본문은 3~4문단, 500자 안팎.",
  long: "본문은 5~6문단, 900자 안팎.",
};

const VOICE = `한국어로 쓴다. 다음 표현은 쓰지 않는다: "완벽한", "조화로운", "돋보이는", "선사합니다", "~의 정수", "공간에 숨을 불어넣다", "단순한 ~을 넘어". 같은 어미를 연달아 쓰지 않는다. 느낌표와 이모지를 쓰지 않는다.`;

/**
 * Vision-capable models in order of preference; the next is tried when one fails, so an AI Gateway
 * that isn't enabled yet doesn't take the feature down. BOOK_WRITER_MODEL overrides the Gateway model.
 */
function writerModels(): LanguageModel[] {
  const models: LanguageModel[] = [];
  if (process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN) models.push(process.env.BOOK_WRITER_MODEL?.trim() || "anthropic/claude-sonnet-5-5");
  if (process.env.OPENAI_API_KEY?.trim()) models.push(openai(process.env.OPENAI_MODEL_HEAVY || "gpt-5.4-mini"));
  if (process.env.DEEPSEEK_API_KEY?.trim()) models.push(deepseekModel("deepseek-flash"));
  const baseURL = process.env.CHAT_LLM_BASE_URL?.trim();
  if (baseURL) models.push(createOpenAI({ baseURL, apiKey: process.env.CHAT_LLM_API_KEY || "local", name: "local" }).chat("gemma4:26b"));
  if (models.length === 0) throw new Error("AI 모델이 설정되지 않았습니다.");
  return models;
}

async function askJson<T>(system: string, content: UserContent, maxOutputTokens: number): Promise<T> {
  const messages: ModelMessage[] = [{ role: "user", content }];
  let last: unknown;
  for (const model of writerModels()) {
    try {
      const { text } = await generateText({ model, system: `${system}\n반드시 JSON 객체 하나만 출력한다. 설명 문장이나 코드블록 표시는 쓰지 않는다.`, messages, maxOutputTokens, abortSignal: AbortSignal.timeout(90_000) });
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
    } catch (error) {
      last = error;
      console.warn("[flipbook-write] model failed", (error as Error).message?.slice(0, 200));
    }
  }
  throw last instanceof Error ? last : new Error("AI 응답을 읽지 못했습니다.");
}

const pictures = (images: string[]): UserContent => images.map((url) => ({ type: "image" as const, image: new URL(url) }));

export type PhotoReading = { summary: string; observed: string[]; uncertain: string[] };

/** What the model can actually see, so the editor can check it before anything is written. */
export async function readPhotos(images: string[], memo: string): Promise<PhotoReading> {
  const system = `너는 실내건축 사진을 판독하는 전문 에디터다. 사진에 실제로 보이는 것만 적는다.
추측이 필요한 것(브랜드, 정확한 자재명, 면적, 위치, 가격, 시공 시기)은 observed에 쓰지 말고 uncertain에 "~인지 확인 필요" 형식으로 적는다.
재료는 보이는 만큼만 말한다. 예를 들어 나무결이 보여도 원목인지 필름인지 모르면 "나무결 마감"이라고 쓴다.
JSON 형식: {"summary":"사진 전체를 설명하는 두 문장","observed":["공간 종류, 구도, 가구와 사물, 마감과 질감, 색, 빛의 방향과 분위기를 항목별 한 문장씩, 6~10개"],"uncertain":["확인이 필요한 항목 0~5개"]}`;
  const note = memo.trim() ? `편집자 메모(사실로 받아들인다): ${memo.trim()}` : "편집자 메모 없음";
  const reading = await askJson<PhotoReading>(system, [...(pictures(images) as Exclude<UserContent, string>), { type: "text", text: `사진 ${images.length}장을 판독해 줘.\n${note}` }], 1500);
  return { summary: String(reading.summary ?? ""), observed: (reading.observed ?? []).map(String), uncertain: (reading.uncertain ?? []).map(String) };
}

async function wikiFacts(query: string): Promise<string> {
  try {
    const hits = (await searchWiki(query.slice(0, 300), 4)).filter((hit) => !hit.status || hit.status === "published").slice(0, 3);
    if (hits.length === 0) return "";
    return `\n\n참고 지식(사진 내용과 직접 관련될 때만 사실 확인용으로 쓰고, 출처나 "위키" 같은 말은 글에 쓰지 않는다):\n${hits.map((hit) => `- ${hit.title}: ${hit.excerpt.slice(0, 400)}`).join("\n")}`;
  } catch {
    return "";
  }
}

export type Article = { kicker: string; title: string; lead: string; body: string; caption: string };

export async function writeArticle(input: { images: string[]; understanding: string; style: string; length: string; memo: string; previous?: Article; instruction?: string }): Promise<Article> {
  const style = WRITING_STYLES[input.style] ?? WRITING_STYLES.magazine;
  const length = input.style === "caption" ? "본문은 한두 문장." : LENGTHS[input.length] ?? LENGTHS.medium;
  const system = `너는 국내 인테리어 매거진의 수석 에디터다.
문체: ${style}
분량: ${length}
${VOICE}
사실 규칙: '확인된 사진 내용'과 '편집자 메모'에 있는 사실만 단정한다. 브랜드, 자재명, 면적, 가격, 위치, 거주자 이야기를 지어내지 않는다. 사진을 근거로 구체적으로 쓴다.
JSON 형식: {"kicker":"6~12자의 작은 머리말","title":"시선을 끄는 제목 8~22자","lead":"제목 아래 한두 문장","body":"본문, 문단은 빈 줄로 구분","caption":"사진 설명 한 문장"}`;
  const memo = input.memo.trim() ? `\n\n편집자 메모(사실):\n${input.memo.trim()}` : "";
  const revising = input.previous ? `\n\n지금 원고:\n${JSON.stringify(input.previous)}\n\n수정 요청: ${input.instruction?.trim() || "더 좋게 다듬어 줘"}\n수정 요청을 반영하되 요청하지 않은 부분의 사실은 그대로 둔다.` : "";
  const facts = await wikiFacts(`${input.understanding} ${input.memo}`);
  return normalise(await askJson<Article>(system, [
    ...(pictures(input.images) as Exclude<UserContent, string>),
    { type: "text", text: `확인된 사진 내용(편집자가 검토함, 사진과 다르면 이 내용을 따른다):\n${input.understanding}${memo}${facts}${revising}\n\n이 사진들로 글을 써 줘.` },
  ], 2600));
}

const normalise = (article: Article): Article => ({ kicker: String(article.kicker ?? ""), title: String(article.title ?? ""), lead: String(article.lead ?? ""), body: String(article.body ?? ""), caption: String(article.caption ?? "") });

/** Rewrites one text box on the page as asked, keeping its facts. */
export async function rewriteText(text: string, instruction: string): Promise<string> {
  const system = `너는 한국어 매거진 교열 에디터다. 요청대로 글을 고친다. 원문에 없는 사실을 더하지 않는다.
${VOICE}
JSON 형식: {"text":"고친 글"}`;
  const result = await askJson<{ text: string }>(system, `원문:\n${text}\n\n요청: ${instruction}`, 1800);
  return String(result.text ?? "");
}
