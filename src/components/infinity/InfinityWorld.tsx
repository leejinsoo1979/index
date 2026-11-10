import type { CSSProperties, ReactNode, Ref } from "react";
import { ElementBody } from "../flipbook/BookPageView";
import { TypeText } from "./TypeText";
import type { BookRuntime } from "../flipbook/BookRuntime";
import type { BookElement } from "../../lib/flipbooks";
import type { Camera, InfinityCanvas, InfinityFrame } from "../../lib/infinity";
import "./Infinity.css";

export const worldBox = (box: { x: number; y: number; w: number; h: number; rotation?: number; opacity?: number }): CSSProperties => ({
  left: box.x,
  top: box.y,
  width: box.w,
  height: box.h,
  transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
  opacity: box.opacity ?? 1,
});

export function FrameShape({ frame }: { frame: InfinityFrame }) {
  const ring = frame.stroke ? `${Math.max(2, Math.min(frame.w, frame.h) * 0.022)}px solid ${frame.stroke}` : undefined;
  return <div className={`ib-frame ib-frame--${frame.shape}`} style={{ ...worldBox(frame), background: frame.fill, border: ring }} />;
}

/** The canvas background: a colour, optionally with an image or gradient over it. */
export function backdropStyle(canvas: InfinityCanvas): CSSProperties {
  const image = canvas.backgroundImage;
  return {
    backgroundColor: canvas.background,
    backgroundImage: image ? (/^(linear|radial)-gradient/.test(image) ? image : `url("${image}")`) : undefined,
    backgroundSize: canvas.imageFit === "contain" ? "contain" : "cover",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
  };
}

/** With parallax the background drifts a little and grows slowly as the camera moves in. */
export function paintBackdrop(element: HTMLElement | null, canvas: InfinityCanvas, camera: Camera, home: Camera, viewWidth: number) {
  if (!element) return;
  if (!canvas.parallax) { element.style.transform = ""; return; }
  const depth = Math.max(0, Math.min(0.35, Math.log(camera.zoom / home.zoom) * 0.04));
  const dx = Math.max(-0.06, Math.min(0.06, ((camera.x - home.x) * home.zoom) / Math.max(viewWidth, 1) * 0.08));
  const dy = Math.max(-0.06, Math.min(0.06, ((camera.y - home.y) * home.zoom) / Math.max(viewWidth, 1) * 0.08));
  element.style.transform = `scale(${1.12 + depth}) translate(${-dx * 100}%, ${-dy * 100}%)`;
}

export function Backdrop({ canvas, backdropRef }: { canvas: InfinityCanvas; backdropRef?: Ref<HTMLDivElement> }) {
  return <div ref={backdropRef} className="ib-backdrop" style={backdropStyle(canvas)} />;
}

/**
 * The canvas in world coordinates: frames underneath, elements on top, then whatever the caller adds
 * (selection handles). The camera transform is applied by the parent through `style`.
 */
export function InfinityWorld({ canvas, still, runtime, style, children, renderElement, layerRef, reveal }: {
  canvas: InfinityCanvas;
  layerRef?: Ref<HTMLDivElement>;
  still: boolean;
  runtime?: BookRuntime;
  style?: CSSProperties;
  children?: ReactNode;
  /** The editor wraps each element to make it selectable. */
  renderElement?: (element: BookElement, body: ReactNode) => ReactNode;
  /** Viewer: null hides an element until its frame is reached; a number replays its entrance animation. */
  reveal?: (element: BookElement) => number | null | undefined;
}) {
  return (
    <div ref={layerRef} className="ib-layer" style={style}>
      <div className="ib-world">
        {canvas.frames.map((frame) => <FrameShape key={frame.id} frame={frame} />)}
        {canvas.elements.map((element) => {
          const shown = reveal?.(element);
          const animated = Boolean(element.animation && element.animation !== "none" && shown !== undefined);
          const body = <ElementBody element={element} still={still} runtime={runtime} />;
          if (renderElement) return renderElement(element, body);
          const interactive = !still && ["video", "slideshow", "audio", "map", "embed"].includes(element.type);
          const typing = animated && shown !== null && element.type === "text" && element.animation === "type";
          return (
            <div key={element.id} className={`ib-el fb-el--${element.type}`} style={{ ...worldBox(element), visibility: shown === null ? "hidden" : undefined }} data-interactive={interactive || undefined}>
              {typing
                ? <div key={shown ?? 0} className="fb-el__in"><TypeText element={element} still={still} /></div>
                : <div key={shown ?? 0} className={`fb-el__in${animated && shown !== null ? ` fb-anim fb-anim--${element.animation}` : ""}`} style={animated ? { animationDuration: `${element.duration ?? 0.7}s`, animationDelay: `${element.delay ?? 0}s` } : undefined}>{body}</div>}
            </div>
          );
        })}
        {children}
      </div>
    </div>
  );
}
