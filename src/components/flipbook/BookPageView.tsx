import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FiChevronLeft, FiChevronRight, FiImage, FiPause, FiPlay } from "react-icons/fi";
import { pageLabel, safeUrl, videoEmbedUrl, videoSource, type AudioElement, type BookElement, type BookPage, type Flipbook, type SlideshowElement, type TextElement, type VideoCrop, type VideoElement, type VideoSource, type ChartElement, type GridElement, type ImageElement, type ShapeElement } from "../../lib/flipbooks";
import { bookIcon, shapePath } from "./graphics";
import type { BookRuntime } from "./BookRuntime";
import "./Flipbook.css";

export const elementBox = (element: BookElement): CSSProperties => ({
  left: `${element.x}%`,
  top: `${element.y}%`,
  width: `${element.w}%`,
  height: `${element.h}%`,
  transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
  opacity: element.opacity ?? 1,
});

/** 1 page unit = 0.1% of the page width, so text scales with the page. */
export const pageUnits = (size: number) => `${size * 0.1}cqw`;

const SLIDE_MS = 3500;

/** The whole book, for what depends on it: page numbers, the table of contents, always-shown elements. */
const BookInfo = createContext<{ book: Flipbook; editing: boolean; shared: { ownerId: string; element: BookElement }[] } | null>(null);

export function BookProvider({ book, editing = false, children }: { book: Flipbook; editing?: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ book, editing, shared: book.pages.flatMap((page) => page.elements.filter((element) => element.everyPage).map((element) => ({ ownerId: page.id, element }))) }), [book, editing]);
  return <BookInfo.Provider value={value}>{children}</BookInfo.Provider>;
}

/** Elements another page has marked 항상 표시. */
export function useSharedElements(pageId: string) {
  const info = useContext(BookInfo);
  return useMemo(() => info?.shared.filter((item) => item.ownerId !== pageId).map((item) => item.element) ?? [], [info, pageId]);
}

function textEffect(element: TextElement): CSSProperties {
  const accent = element.effectColor ?? "#3f8ff0";
  switch (element.effect) {
    case "shadow": return { textShadow: `.5cqw .5cqw 0 ${accent}` };
    case "lift": return { textShadow: "0 .6cqw 1.6cqw rgba(0,0,0,.42)" };
    case "neon": return { textShadow: `0 0 .6cqw ${accent}, 0 0 1.6cqw ${accent}, 0 0 3.2cqw ${accent}` };
    case "hollow": return { color: "transparent", WebkitTextStroke: `.25cqw ${element.color}` };
    case "gradient": return { color: "transparent", backgroundImage: `linear-gradient(90deg, ${element.color}, ${accent})`, WebkitBackgroundClip: "text", backgroundClip: "text" };
    default: return {};
  }
}

export const textStyle = (element: TextElement): CSSProperties => ({
  fontSize: pageUnits(element.size),
  color: element.color,
  fontWeight: element.bold ? 700 : 400,
  fontStyle: element.italic ? "italic" : "normal",
  fontFamily: element.font && element.font !== "inherit" ? element.font : undefined,
  textAlign: element.align,
  textDecoration: [element.underline ? "underline" : "", element.strike ? "line-through" : ""].filter(Boolean).join(" ") || undefined,
  textTransform: element.textCase === "upper" ? "uppercase" : element.textCase === "lower" ? "lowercase" : undefined,
  letterSpacing: element.spacing ? `${element.spacing / 1000}em` : undefined,
  lineHeight: element.lineHeight ?? undefined,
  background: element.background || undefined,
  columnCount: element.columns && element.columns > 1 ? element.columns : undefined,
  WebkitTextStroke: element.borderWidth ? `${element.borderWidth * 0.1}cqw ${element.borderColor ?? "#000"}` : undefined,
  ...textEffect(element),
});

const border = (element: BookElement): CSSProperties => (element.borderWidth ? { border: `${element.borderWidth * 0.1}cqw solid ${element.borderColor ?? "#000"}`, boxSizing: "border-box" } : {});

function Slideshow({ element, still }: { element: SlideshowElement; still: boolean }) {
  const [index, setIndex] = useState(0);
  const count = element.images.length;
  useEffect(() => {
    if (still || !element.auto || count < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [still, element.auto, count]);
  if (count === 0) return <div className="fb-empty">슬라이드쇼</div>;
  const at = Math.min(index, count - 1);
  const go = (step: number) => setIndex((at + step + count) % count);
  return (
    <div className={`fb-slides fb-slides--${element.variant}`}>
      <div className="fb-slides__track" style={{ transform: `translateX(calc(${element.variant === "peek" ? 12.5 : 0}% - ${at * (element.variant === "peek" ? 75 : 100)}%))` }}>
        {element.images.map((src, i) => <div key={`${src}-${i}`} className={`fb-slides__item${i === at ? " is-on" : ""}`}><img src={src} alt="" draggable={false} /></div>)}
      </div>
      {count > 1 && (
        <>
          <button type="button" className="fb-slides__arrow fb-slides__arrow--prev" aria-label="이전 사진" tabIndex={still ? -1 : 0} onClick={() => go(-1)}><FiChevronLeft /></button>
          <button type="button" className="fb-slides__arrow fb-slides__arrow--next" aria-label="다음 사진" tabIndex={still ? -1 : 0} onClick={() => go(1)}><FiChevronRight /></button>
          <div className="fb-slides__dots">{element.images.map((src, i) => <i key={`${src}-${i}`} className={i === at ? "is-on" : ""} />)}</div>
        </>
      )}
    </div>
  );
}

/** Plays only the chosen part of a video file: starts at `start` and stops at `end`. */
/** Shows a picture or video file cropped to the chosen area, or whole. */
export function cropStyle(crop: VideoCrop = {}): CSSProperties {
  if (crop.fit === "contain") return { objectFit: "contain" };
  const origin = `${crop.cropX ?? 50}% ${crop.cropY ?? 50}%`;
  return { objectFit: "cover", objectPosition: origin, transformOrigin: origin, transform: `scale(${(crop.cropZoom ?? 100) / 100})` };
}

function FilePlayer({ src, start = 0, end, autoPlay, muted, controls = true, crop }: { src: string; start?: number; end?: number; autoPlay?: boolean; muted?: boolean; controls?: boolean; crop?: VideoCrop }) {
  const player = useRef<HTMLVideoElement>(null);
  const limit = end && end > start ? end : undefined;
  const rewindIfOutside = () => {
    const video = player.current;
    if (video && (video.currentTime < start || (limit !== undefined && video.currentTime >= limit - 0.05))) video.currentTime = start;
  };
  const stopAtEnd = () => {
    const video = player.current;
    if (video && limit !== undefined && video.currentTime >= limit) video.pause();
  };
  // Native controls would be scaled and cropped along with a zoomed picture, so it plays on click instead.
  const zoomed = crop?.fit !== "contain" && (crop?.cropZoom ?? 100) > 100;
  const toggle = () => { const video = player.current; if (video) { if (video.paused) void video.play(); else video.pause(); } };
  // Buttons appear only under the pointer; without hover (touch) a tap plays and pauses.
  const [hovering, setHovering] = useState(false);
  const showControls = controls && !zoomed && hovering;
  return <div className="fb-fill" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}><video ref={player} className="fb-frame" style={cropStyle(crop)} src={src} controls={showControls} onClick={showControls ? undefined : toggle} playsInline preload="metadata" autoPlay={autoPlay} muted={muted} onLoadedMetadata={rewindIfOutside} onPlay={rewindIfOutside} onTimeUpdate={stopAtEnd} /></div>;
}

const YOUTUBE_ENDED = 0;
const YOUTUBE_PLAYING = 1;
const YOUTUBE_PAUSED = 2;

/** hqdefault.jpg has black bars baked in, so use the 16:9 sizes; not every video has the large one. */
function YouTubeThumb({ id, crop }: { id: string; crop?: VideoCrop }) {
  const [large, setLarge] = useState(true);
  return <img src={`https://i.ytimg.com/vi/${id}/${large ? "hq720" : "mqdefault"}.jpg`} alt="" draggable={false} style={cropStyle(crop)} onError={() => setLarge(false)} />;
}

/** An embedded player can't crop itself, so it is sized past the slot and shifted to show the chosen area. */
function FillFrame({ ratio, crop = {}, children }: { ratio: number; crop?: VideoCrop; children: ReactNode }) {
  if (crop.fit === "contain") return <>{children}</>;
  return <div className="fb-fill fb-fill--crop" style={{ ["--video-ratio" as string]: ratio, ["--video-zoom" as string]: (crop.cropZoom ?? 100) / 100, ["--video-x" as string]: (crop.cropX ?? 50) / 100, ["--video-y" as string]: (crop.cropY ?? 50) / 100 }}>{children}</div>;
}

/**
 * Shows our own poster until play is pressed and goes back to it when the video ends, so YouTube's
 * title bar and end screen ("more videos") don't sit on the page. Nothing is drawn over the player.
 */
function YouTubePlayer({ source, start, end, autoStart, muted, controls, crop }: { source: Extract<VideoSource, { id: string }>; start?: number; end?: number; autoStart?: boolean; muted?: boolean; controls?: boolean; crop?: VideoCrop }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(Boolean(autoStart));
  const [pressed, setPressed] = useState(false);
  const resumeAt = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing) return;
    let started = false;
    let at = resumeAt.current ?? start ?? source.urlStart ?? 0;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== "string") return;
      let data: { event?: string; info?: number | { playerState?: number; currentTime?: number } };
      try { data = JSON.parse(event.data); } catch { return; }
      if (typeof data.info === "object" && typeof data.info?.currentTime === "number") at = data.info.currentTime;
      const state = data.event === "onStateChange" ? data.info : data.event === "infoDelivery" && typeof data.info === "object" ? data.info?.playerState : undefined;
      if (state === YOUTUBE_PLAYING) started = true;
      if (state === YOUTUBE_ENDED) { resumeAt.current = undefined; setPlaying(false); }
      // Paused, YouTube covers the picture with its "more videos" row; our poster resumes from the same spot.
      if (state === YOUTUBE_PAUSED && started && !controls) { resumeAt.current = at; setPlaying(false); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playing, controls, start, source.urlStart]);
  const startListening = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "https://www.youtube-nocookie.com");
  if (!playing) {
    return (
      <button type="button" className="fb-video-still fb-video-poster" aria-label={pressed ? "다시 재생" : "재생"} onClick={() => { setPressed(true); setPlaying(true); }}>
        <YouTubeThumb id={source.id} crop={crop} /><span><FiPlay /></span>
      </button>
    );
  }
  return <FillFrame ratio={source.vertical ? 9 / 16 : 16 / 9} crop={crop}><iframe ref={frame} className="fb-frame" src={videoEmbedUrl(source, { start: resumeAt.current ?? start, end, autoPlay: true, muted: muted && !pressed, controls })} title="영상" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen onLoad={startListening} /></FillFrame>;
}

/** A video from any supported source, limited to the chosen range; also used by the popup. `autoStart` plays at once. */
export function VideoPlayer({ src, start, end, autoStart, muted, controls, crop }: { src: string; start?: number; end?: number; autoStart?: boolean; muted?: boolean; controls?: boolean; crop?: VideoCrop }) {
  const source = videoSource(src);
  if (!source) return <div className="fb-empty">재생할 수 없는 주소입니다</div>;
  if (source.kind === "file") return <FilePlayer src={source.url} start={start} end={end} autoPlay={autoStart} muted={muted} crop={crop} />;
  if (source.kind === "youtube") return <YouTubePlayer source={source} start={start} end={end} autoStart={autoStart} muted={muted} controls={controls} crop={crop} />;
  return <FillFrame ratio={16 / 9} crop={crop}><iframe className="fb-frame" src={videoEmbedUrl(source, { start, end, autoPlay: autoStart, muted, controls })} title="영상" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></FillFrame>;
}

function Video({ element, still }: { element: VideoElement; still: boolean }) {
  if (!element.src) return <div className="fb-empty"><FiPlay />비디오</div>;
  if (!still) return <VideoPlayer src={element.src} start={element.start} end={element.end} autoStart={element.autoPlay} muted={element.autoPlay} controls={element.controls} crop={element} />;
  const source = videoSource(element.src);
  if (source?.kind === "youtube") return <div className="fb-video-still"><YouTubeThumb id={source.id} crop={element} /><span><FiPlay /></span></div>;
  if (source?.kind === "file") return <div className="fb-video-still"><video src={`${source.url}#t=${element.start ?? 0}`} preload="metadata" muted playsInline style={cropStyle(element)} /><span><FiPlay /></span></div>;
  return <div className="fb-empty"><FiPlay />{source ? "Vimeo 영상" : "재생할 수 없는 주소입니다"}</div>;
}

function AudioButton({ element, still }: { element: AudioElement; still: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const player = audio.current;
    if (!player) return;
    if (player.paused) void player.play();
    else player.pause();
  };
  return (
    <>
      <button type="button" className="fb-audio" style={{ background: element.color }} aria-label={playing ? "일시정지" : "소리 재생"} tabIndex={still ? -1 : 0} onClick={toggle}>{playing ? <FiPause /> : <FiPlay />}</button>
      {!still && element.src && <audio ref={audio} src={element.src} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />}
    </>
  );
}

function GridBody({ element }: { element: GridElement }) {
  const editing = useContext(BookInfo)?.editing;
  return (
    <div className="fb-grid">
      {element.cells.map((cell, index) => {
        const origin = `${cell.focusX ?? 50}% ${cell.focusY ?? 50}%`;
        return (
          <div key={index} className="fb-grid__cell" style={{ left: `${cell.x}%`, top: `${cell.y}%`, width: `${cell.w}%`, height: `${cell.h}%`, padding: `${element.gap * 0.05}cqw` }}>
            <div className={`fb-grid__slot${cell.src ? "" : " is-empty"}`} style={{ borderRadius: `${element.radius * 0.1}cqw`, ...border(element) }}>
              {cell.src
                ? <img src={cell.src} alt="" draggable={false} loading="lazy" style={{ objectPosition: origin, transformOrigin: origin, transform: `scale(${(cell.zoom ?? 100) / 100})` }} />
                : editing && <FiImage />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImageBody({ element }: { element: ImageElement }) {
  const box: CSSProperties = { borderRadius: `${(element.radius ?? 0) * 0.1}cqw`, clipPath: element.mask ? `url(#fb-mask-${element.mask})` : undefined, ...border(element) };
  const zoom = (element.zoom ?? 100) / 100;
  const origin = `${element.focusX ?? 50}% ${element.focusY ?? 50}%`;
  const filter = [
    `brightness(${element.brightness ?? 100}%)`, `contrast(${element.contrast ?? 100}%)`, `saturate(${element.saturate ?? 100}%)`,
    `grayscale(${element.grayscale ?? 0}%)`, `sepia(${element.sepia ?? 0}%)`, element.blur ? `blur(${element.blur * 0.1}cqw)` : "",
  ].join(" ");
  return (
    <div className="fb-imgbox" style={box}>
      {element.mask && <svg className="fb-maskdefs" aria-hidden="true"><defs><clipPath id={`fb-mask-${element.mask}`} clipPathUnits="objectBoundingBox"><path d={shapePath(element.mask)} transform="scale(0.01)" /></clipPath></defs></svg>}
      {element.src
        ? <img src={element.src} alt="" draggable={false} loading="lazy" style={{ objectFit: element.fit, objectPosition: origin, filter, transformOrigin: origin, transform: `scale(${zoom * (element.flipX ? -1 : 1)}, ${zoom * (element.flipY ? -1 : 1)})` }} />
        : <div className="fb-empty">사진</div>}
    </div>
  );
}

function ShapeBody({ element }: { element: ShapeElement }) {
  const gradient = `fb-grad-${element.id}`;
  return (
    <svg className="fb-shape" viewBox="0 0 100 100" preserveAspectRatio="none">
      {element.fill2 && <defs><linearGradient id={gradient} gradientTransform={`rotate(${element.angle ?? 45} .5 .5)`}><stop offset="0" stopColor={element.fill} /><stop offset="1" stopColor={element.fill2} /></linearGradient></defs>}
      <path d={shapePath(element.shape)} fill={element.fill2 ? `url(#${gradient})` : element.fill} fillRule="evenodd" vectorEffect="non-scaling-stroke" stroke={element.borderWidth ? element.borderColor ?? "#000" : "none"} strokeDasharray={element.dashed ? "8 6" : undefined} style={{ strokeWidth: `${(element.borderWidth ?? 0) * 0.1}cqw` }} />
    </svg>
  );
}

const CHART_SHADES = [1, 0.74, 0.52, 0.36, 0.86, 0.62, 0.44, 0.28];

function Chart({ element }: { element: ChartElement }) {
  const values = element.values.map((value) => Math.max(0, value));
  const peak = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const font = { fontSize: 13, fill: element.textColor };
  if (element.kind === "pie" || element.kind === "donut") {
    let start = -Math.PI / 2;
    const cx = 120; const cy = 130; const radius = 104;
    return (
      <svg className="fb-chart" viewBox="0 0 400 260">
        {values.map((value, i) => {
          const sweep = (value / total) * Math.PI * 2;
          const end = start + Math.min(sweep, Math.PI * 1.9999);
          const d = `M${cx} ${cy}L${cx + radius * Math.cos(start)} ${cy + radius * Math.sin(start)}A${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${cx + radius * Math.cos(end)} ${cy + radius * Math.sin(end)}Z`;
          start += sweep;
          return <path key={i} d={d} fill={element.color} fillOpacity={CHART_SHADES[i % CHART_SHADES.length]} stroke="#fff" />;
        })}
        {element.kind === "donut" && <circle cx={cx} cy={cy} r={radius * 0.55} fill="#fff" />}
        {element.labels.map((label, i) => (
          <g key={i} transform={`translate(258 ${40 + i * 24})`}><rect width="13" height="13" y="-11" fill={element.color} fillOpacity={CHART_SHADES[i % CHART_SHADES.length]} /><text x="20" {...font}>{label} {Math.round((values[i] / total) * 100)}%</text></g>
        ))}
      </svg>
    );
  }
  const step = 360 / Math.max(1, values.length);
  const x = (i: number) => 24 + step * i + step / 2;
  const y = (value: number) => 220 - (value / peak) * 190;
  return (
    <svg className="fb-chart" viewBox="0 0 400 260">
      <line x1="20" x2="388" y1="220" y2="220" stroke={element.textColor} strokeOpacity=".3" />
      {element.kind === "bar"
        ? values.map((value, i) => <rect key={i} x={x(i) - step * 0.3} y={y(value)} width={step * 0.6} height={220 - y(value)} rx="3" fill={element.color} />)
        : <polyline points={values.map((value, i) => `${x(i)},${y(value)}`).join(" ")} fill="none" stroke={element.color} strokeWidth="3" />}
      {element.kind === "line" && values.map((value, i) => <circle key={i} cx={x(i)} cy={y(value)} r="4.5" fill={element.color} />)}
      {values.map((value, i) => <text key={i} x={x(i)} y={y(value) - 8} textAnchor="middle" {...font}>{value}</text>)}
      {element.labels.map((label, i) => <text key={i} x={x(i)} y="242" textAnchor="middle" {...font}>{label}</text>)}
    </svg>
  );
}

function Frame({ src, title, still, label }: { src: string | null; title: string; still: boolean; label: string }) {
  if (still || !src) return <div className="fb-empty">{label}</div>;
  return <iframe className="fb-frame" src={src} title={title} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />;
}

function PageNumber({ element, pageId }: { element: Extract<BookElement, { type: "pagenumber" }>; pageId?: string }) {
  const info = useContext(BookInfo);
  const pages = info?.book.pages ?? [];
  const index = pages.findIndex((page) => page.id === pageId);
  const number = index >= 0 ? index + 1 : 1;
  return <div className="fb-pagenumber" style={{ fontSize: pageUnits(element.size), color: element.color }}>{element.showTotal ? `${number} / ${pages.length || 1}` : number}</div>;
}

function Contents({ element, still, runtime }: { element: Extract<BookElement, { type: "toc" }>; still: boolean; runtime?: BookRuntime }) {
  const info = useContext(BookInfo);
  const pages = info?.book.pages ?? [];
  const labelled = pages.map((page, index) => ({ page, index, label: pageLabel(page) }));
  const named = labelled.filter((row) => row.label);
  const rows = (named.length > 0 ? named : labelled).slice(0, 40);
  return (
    <div className="fb-toc" style={{ fontSize: pageUnits(element.size), color: element.color }}>
      {rows.map(({ page, index, label }) => (still
        ? <span key={page.id}><em style={{ fontStyle: "normal" }}>{label ?? `${index + 1}쪽`}</em><i style={{ fontStyle: "normal" }}>{index + 1}</i></span>
        : <button key={page.id} type="button" onClick={() => runtime?.run([{ kind: "page", pageId: page.id }])}><em style={{ fontStyle: "normal" }}>{label ?? `${index + 1}쪽`}</em><i style={{ fontStyle: "normal" }}>{index + 1}</i></button>))}
    </div>
  );
}

/** What an element looks like, shared by the editor, the viewer and thumbnails. */
export function ElementBody({ element, still, runtime, pageId }: { element: BookElement; still: boolean; runtime?: BookRuntime; pageId?: string }) {
  switch (element.type) {
    case "grid":
      return <GridBody element={element} />;
    case "image":
      return <ImageBody element={element} />;
    case "text":
      return <div className={`fb-text${element.vertical ? " fb-text--vertical" : ""}`} style={textStyle(element)}>{element.text}</div>;
    case "shape":
      return <ShapeBody element={element} />;
    case "line":
      return (
        <div className="fb-line">
          <i style={{ borderTop: `${element.thickness * 0.1}cqw ${element.style} ${element.color}` }} />
          {element.arrow && <b style={{ borderLeft: `${element.thickness * 0.34}cqw solid ${element.color}`, borderTop: `${element.thickness * 0.2}cqw solid transparent`, borderBottom: `${element.thickness * 0.2}cqw solid transparent` }} />}
        </div>
      );
    case "icon": {
      const Icon = bookIcon(element.name);
      return Icon ? <Icon className="fb-icon" color={element.color} strokeWidth={element.stroke} preserveAspectRatio="xMidYMid meet" /> : null;
    }
    case "chart":
      return <Chart element={element} />;
    case "button":
      return <span className="fb-button" style={{ background: element.color, color: element.textColor, borderRadius: `${element.radius * 0.1}cqw`, ...border(element) }}>{element.label}</span>;
    case "video":
      return <Video element={element} still={still} />;
    case "slideshow":
      return <Slideshow element={element} still={still} />;
    case "audio":
      return <AudioButton element={element} still={still} />;
    case "table":
      return (
        <table className="fb-table" style={{ fontSize: pageUnits(element.size), color: element.color, ...border(element) }}>
          <tbody>{element.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => (r === 0 ? <th key={c} style={{ background: element.headerColor }}>{cell}</th> : <td key={c}>{cell}</td>))}</tr>)}</tbody>
        </table>
      );
    case "map":
      return <Frame still={still} title="지도" label={`지도 · ${element.address || "주소를 입력하세요"}`} src={element.address.trim() ? `https://maps.google.com/maps?q=${encodeURIComponent(element.address)}&output=embed` : null} />;
    case "embed": {
      // YouTube and Vimeo refuse their normal pages inside a frame, so their links play as a video.
      if (videoSource(element.url)) return <Video element={{ ...element, type: "video", src: element.url } as VideoElement} still={still} />;
      const url = safeUrl(element.url);
      return <Frame still={still} title="외부 콘텐츠" label={element.url || "임베드 주소를 입력하세요"} src={url?.startsWith("http") ? url : null} />;
    }
    case "tooltip":
      return <div className={`fb-tip${element.y < 25 ? " fb-tip--below" : ""}`} tabIndex={still ? -1 : 0} style={{ background: element.color }}>i<span className="fb-tip__text">{element.text}</span></div>;
    case "pagenumber":
      return <PageNumber element={element} pageId={pageId} />;
    case "toc":
      return <Contents element={element} still={still} runtime={runtime} />;
    default:
      return null;
  }
}

const SELF_INTERACTIVE = new Set<BookElement["type"]>(["video", "slideshow", "audio", "map", "embed", "toc", "tooltip"]);

function LiveElement({ element, runtime, still, pageId }: { element: BookElement; runtime?: BookRuntime; still: boolean; pageId: string }) {
  const hidden = runtime ? runtime.hidden[element.id] ?? element.hidden : false;
  if (hidden) return null;
  const actions = element.actions?.length ? element.actions : null;
  const interactive = !still && Boolean(actions || SELF_INTERACTIVE.has(element.type));
  const animated = !still && element.animation && element.animation !== "none";
  const hover = element.trigger === "hover";
  const trigger = actions && !still ? {
    role: "button",
    tabIndex: 0,
    ...(hover ? { onMouseEnter: () => runtime?.run(actions) } : {}),
    onClick: hover ? undefined : () => runtime?.run(actions),
    onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter") runtime?.run(actions); },
  } : {};
  return (
    <div className={`fb-el fb-el--${element.type}${actions && !still ? " fb-el--action" : ""}`} style={elementBox(element)} data-interactive={interactive || undefined} {...trigger}>
      <div key={runtime?.plays[element.id] ?? 0} className={`fb-el__in${animated ? ` fb-anim fb-anim--${element.animation}` : ""}`} style={{ ...(element.shadow ? { filter: "drop-shadow(0 .5cqw 1cqw rgba(0,0,0,.35))" } : {}), ...(animated ? { animationDuration: `${element.duration ?? 0.7}s`, animationDelay: `${element.delay ?? 0}s` } : {}) }}>
        <ElementBody element={element} still={still} runtime={runtime} pageId={pageId} />
      </div>
    </div>
  );
}

/**
 * A page. With children the caller draws the elements itself (the editor); `still` is for pages that
 * are only being looked at (thumbnails, a sheet in mid-turn): no players, no entrance animation.
 */
export function BookPageView({ page, runtime, still = false, children }: { page: BookPage; runtime?: BookRuntime; still?: boolean; children?: ReactNode }) {
  const shared = useSharedElements(page.id);
  return (
    <div className="fb-page" style={page.background ? { background: page.background } : undefined}>
      {page.image && <img className="fb-page__image" src={page.image} alt="" draggable={false} loading="lazy" />}
      {children ?? [...shared, ...page.elements].map((element) => <LiveElement key={element.id} element={element} runtime={runtime} still={still || !runtime} pageId={page.id} />)}
    </div>
  );
}
