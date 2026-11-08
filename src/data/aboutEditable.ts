/**
 * The part of the /ai page copy that admins edit in /admin/pages (saved as siteContent "about").
 * Defaults come from `about` in ./about. `curriculum` is left out: its topic matchers are regular
 * expressions (not storable) and the section is no longer shown on the page.
 */
import { about } from "./about";

export const aboutEditableDefaults = {
  hero: about.hero,
  mission: about.mission,
  problems: about.problems,
  agents: about.agents,
  people: about.people,
  together: about.together,
  cloud: about.cloud,
  cta: about.cta,
};

export type AboutEditable = typeof aboutEditableDefaults;

/** Section names shown in the admin editor, in page order. */
export const ABOUT_SECTIONS: { key: keyof AboutEditable; label: string; hint: string }[] = [
  { key: "hero", label: "첫 화면", hint: "페이지 맨 위 큰 제목과 버튼" },
  { key: "mission", label: "미션", hint: "미션 문장과 세 가지 약속" },
  { key: "problems", label: "우리가 푸는 문제", hint: "문제 카드 6개" },
  { key: "agents", label: "에이전트", hint: "AI 도구 소개 문구" },
  { key: "people", label: "협회의 전문가들", hint: "운영진 카드 위 문구" },
  { key: "together", label: "INDEX와 함께하는 사람들", hint: "검정 배경 업체 목록 위 문구 (업체는 '함께하는 업체' 탭)" },
  { key: "cloud", label: "탐구 주제", hint: "키워드 구름" },
  { key: "cta", label: "마무리 문구", hint: "페이지 맨 아래" },
];
