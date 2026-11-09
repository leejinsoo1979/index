import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { createBook } from "@openpageflip/core";
import "@openpageflip/core/styles.css";
import { BookPageView } from "./BookPageView";
import type { Flipbook } from "../../lib/flipbooks";
import type { BookRuntime } from "./BookRuntime";

export type PaperBookControls = { go(direction: 1 | -1): void; jump(page: number): void };
type Props = {
  book: Flipbook; width: number; height: number; single: boolean; duration: number;
  page: number; controls: RefObject<PaperBookControls | null>;
  runtime: BookRuntime; onPage(page: number): void; onTurn(): void;
};

/** React owns page contents through portals; OpenPageFlip owns folding and page placement. */
export default function PaperBook({ book, width, height, single, duration, page, controls, runtime, onPage, onTurn }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onPage, onTurn, page });
  callbacks.current = { onPage, onTurn, page };
  const [visible, setVisible] = useState(single ? page : page + 1);
  const [moving, setMoving] = useState(false);
  const nodes = useMemo(() => {
    const items = book.pages.map(item => {
      const node = document.createElement("div");
      node.className = "fb-paper-page";
      node.dataset.density = "soft";
      node.dataset.pageId = item.id;
      return node;
    });
    // A transparent first face gives a single cover without forcing it to be a hard board.
    const blankFace = () => {
      const blank = document.createElement("div");
      blank.className = "fb-paper-blank";
      blank.dataset.density = "soft";
      blank.setAttribute("aria-hidden", "true");
      return blank;
    };
    if (!single) {
      items.unshift(blankFace());
      if (items.length % 2 === 1) items.push(blankFace());
    }
    return items;
  }, [book.pages, single]);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element || width <= 0 || height <= 0) return;
    element.style.width = `${width * (single ? 1 : 2)}px`;
    element.style.height = `${height}px`;
    element.append(...nodes);
    const nativePage = (index: number) => single ? index : index + 1;
    const realPage = (index: number) => Math.max(0, single ? index : index - 1);
    const hasBackBlank = !single && book.pages.length % 2 === 0;
    const shift = (index: number) => single ? 0 : index === 0 ? -width / 2 : hasBackBlank && index === nodes.length - 2 ? width / 2 : 0;
    const center = (index: number) => element.style.setProperty("--paper-shift", `${shift(index)}px`);
    const api = createBook(element, {
      pages: nodes, width, height, size: "fixed", autoSize: false,
      layout: single ? "single" : "spread", cover: false,
      startPage: nativePage(callbacks.current.page), flipDuration: duration,
      shadows: true, shadowOpacity: .38, hover: true, click: "edges", drag: true, swipe: true,
      ignoreDragOn: "a,button,input,textarea,select,video,audio,iframe,[data-interactive],[data-opf-no-flip]",
    });
    let played = false;
    let previousProgress = 0;
    const sync = () => {
      setVisible(api.page);
      center(api.page);
      callbacks.current.onPage(realPage(api.page));
    };
    api.on("init", sync);
    api.on("flip", sync);
    api.on("changeState", ({ state }) => {
      setMoving(state === "user_fold" || state === "flipping");
      if (state === "read") { played = false; previousProgress = 0; center(api.page); }
    });
    api.on("flipProgress", ({ from, to, progress }) => {
      element.style.setProperty("--paper-shift", `${shift(from) + (shift(to) - shift(from)) * progress}px`);
      // A hover or a fold dropped back onto the same page stays silent.
      if (!played && api.state === "flipping" && progress > previousProgress && progress < 1) {
        played = true;
        callbacks.current.onTurn();
      }
      previousProgress = progress;
    });
    controls.current = {
      go(direction) { if (direction === 1) void api.flipNext("bottom"); else void api.flipPrev("bottom"); },
      jump(index) { api.turnTo(nativePage(index)); sync(); },
    };
    sync();
    return () => {
      controls.current = null;
      api.destroy();
      for (const node of nodes) node.remove();
    };
  }, [nodes, width, height, single, duration, controls]);

  return <>
    <div ref={host} className="fb-paper-book" data-engine="openpageflip" style={{ width: width * (single ? 1 : 2), height }} />
    {book.pages.map((item, index) => {
      const nativeIndex = single ? index : index + 1;
      const still = moving || (nativeIndex !== visible && (single || nativeIndex !== visible + 1));
      return createPortal(<BookPageView page={item} runtime={runtime} still={still} />, nodes[nativeIndex], item.id);
    })}
  </>;
}
