/**
 * 주거 실내건축 생애주기 단계와 대상 — the single shared taxonomy for 업무 지도, AI 도구,
 * 커리큘럼. Import the ids from here; never redefine stage names elsewhere.
 * Plain data with no imports so both the SPA and `api/*` functions can use it.
 */
export const LIFECYCLE_STAGES = [
  { id: "needs", label: "요구분석·공간계획" },
  { id: "design", label: "설계·자재선정" },
  { id: "contract", label: "견적·계약" },
  { id: "prep", label: "공동주택 공사준비" },
  { id: "build", label: "공정·협업" },
  { id: "quality", label: "품질·준공" },
  { id: "care", label: "유지관리·하자·분쟁" },
] as const;

export const AUDIENCES = [
  { id: "owner", label: "건축주" },
  { id: "designer", label: "디자이너" },
  { id: "builder", label: "시공사" },
] as const;

export type StageId = (typeof LIFECYCLE_STAGES)[number]["id"];
export type AudienceId = (typeof AUDIENCES)[number]["id"];

export const stageLabel = (id: string) => LIFECYCLE_STAGES.find((s) => s.id === id)?.label ?? id;
export const audienceLabel = (id: string) => AUDIENCES.find((a) => a.id === id)?.label ?? id;
