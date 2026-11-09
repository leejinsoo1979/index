export type BookTurnEffect = "paper" | "hardcover" | "slide" | "fade";
export type BookTurnSound = "none" | "paper" | "soft";
export type BookReaderSettings = { effect: BookTurnEffect; duration: number; sound: BookTurnSound; volume: number };

export const BOOK_TURN_EFFECTS: { value: BookTurnEffect; label: string }[] = [
  { value: "paper", label: "부드러운 책장 넘김" }, { value: "hardcover", label: "단단한 표지" },
  { value: "slide", label: "슬라이드" }, { value: "fade", label: "페이드" },
];
export const BOOK_TURN_SOUNDS: { value: BookTurnSound; label: string }[] = [
  { value: "none", label: "소리 없음" }, { value: "paper", label: "책장 넘김 · 기본" }, { value: "soft", label: "책장 넘김 · 조용하게" },
];
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** Books without an explicit sound preference use the supplied page-turn recording. */
export function resolveBookReaderSettings(value?: Partial<BookReaderSettings> | null): BookReaderSettings {
  return {
    effect: BOOK_TURN_EFFECTS.some(e => e.value === value?.effect) ? value!.effect! : "paper",
    duration: bounded(value?.duration, 650, 250, 1400),
    sound: BOOK_TURN_SOUNDS.some(e => e.value === value?.sound) ? value!.sound! : "paper",
    volume: bounded(value?.volume, .4, 0, 1),
  };
}
