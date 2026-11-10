/**
 * PDF로 내보내기: every stop of the path on its own landscape page (overview first), then the browser's
 * print dialog, where "PDF로 저장" makes the file.
 */
import { useEffect } from "react";
import { BookProvider } from "../flipbook/BookPageView";
import { loadBookFonts, type Flipbook } from "../../lib/flipbooks";
import { fitCamera, overviewRect, pathSteps, worldTransform } from "../../lib/infinity";
import { InfinityWorld, backdropStyle } from "./InfinityWorld";
import "./Infinity.css";

const PAGE = { w: 1600, h: 900 };

export default function InfinityPrint({ book }: { book: Flipbook }) {
  const canvas = book.canvas!;
  const stops = [overviewRect(canvas), ...pathSteps(canvas).filter((step) => !step.back).map((step) => step.frame)];
  useEffect(() => {
    loadBookFonts(canvas.elements.flatMap((element) => (element.type === "text" && element.font ? [element.font] : [])));
    let live = true;
    void document.fonts.ready.then(() => window.setTimeout(() => { if (live) window.print(); }, 600));
    return () => { live = false; };
  }, [canvas]);
  return (
    <BookProvider book={book}>
      <div className="ibp">
        {stops.map((rect, index) => (
          <section key={index} className="ibp-page" style={backdropStyle(canvas)}>
            <InfinityWorld canvas={canvas} still style={{ transform: worldTransform(fitCamera(rect, PAGE.w, PAGE.h, 0.92), PAGE.w, PAGE.h) }} />
          </section>
        ))}
      </div>
    </BookProvider>
  );
}
