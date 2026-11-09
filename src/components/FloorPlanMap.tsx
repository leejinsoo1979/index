/**
 * 단지 지도 — Kakao Maps with every complex that has floor plans. Zoomed in, a complex is the black
 * "in" pin; zoomed out, nearby ones merge into a count. Only what is on screen becomes DOM, and the
 * merging is done here on a pixel grid because 17,000 Kakao markers would stall the page.
 * Coordinates come from index/geo.json in R2 (scripts/floorplans-geocode.mjs).
 */
import { useEffect, useRef, useState } from "react";
import type { DanjiInfo } from "./FloorPlanCards";
import "./FloorPlanMap.css";

type AuthHeaders = () => Promise<Record<string, string>>;
type SpotRow = [kbId: string, lat: number, lng: number, name: string, region: number, dong: string, count: number];
type MapData = { regions: string[]; spots: SpotRow[]; total: number };
type Spot = DanjiInfo & { lat: number; lng: number };

type LatLng = { getLat(): number; getLng(): number };
type Bounds = { getSouthWest(): LatLng; getNorthEast(): LatLng; extend(point: LatLng): void };
export type Overlay = { setMap(map: KakaoMap | null): void; setZIndex(z: number): void; setPosition(position: LatLng): void };
export type KakaoMap = {
  getBounds(): Bounds;
  getLevel(): number;
  getCenter(): LatLng;
  setLevel(level: number): void;
  setCenter(point: LatLng): void;
  panTo(point: LatLng): void;
  setBounds(bounds: Bounds, ...padding: number[]): void;
  relayout(): void;
  addControl(control: unknown, position: number): void;
};
type GeocoderAddress = { address_name: string; x: string; y: string; address: { address_name: string } | null; road_address: { address_name: string; building_name: string; zone_no: string } | null };
type KakaoStatusCallback<T> = (result: T[], status: string) => void;
export type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => Bounds;
  Map: new (container: HTMLElement, options: { center: LatLng; level: number }) => KakaoMap;
  CustomOverlay: new (options: { position: LatLng; content: HTMLElement; xAnchor: number; yAnchor: number; clickable: boolean; zIndex: number }) => Overlay;
  ZoomControl: new () => unknown;
  ControlPosition: { RIGHT: number };
  event: { addListener(target: unknown, type: string, handler: (event?: { latLng: LatLng }) => void): void; removeListener(target: unknown, type: string, handler: (event?: { latLng: LatLng }) => void): void };
  services: {
    Status: { OK: string };
    Geocoder: new () => {
      addressSearch(query: string, callback: KakaoStatusCallback<GeocoderAddress>): void;
      coord2RegionCode(lng: number, lat: number, callback: KakaoStatusCallback<{ region_type: string; region_1depth_name: string; region_2depth_name: string; region_3depth_name: string }>): void;
      coord2Address(lng: number, lat: number, callback: KakaoStatusCallback<Pick<GeocoderAddress, "address" | "road_address">>): void;
    };
    Places: new () => { keywordSearch(query: string, callback: KakaoStatusCallback<{ place_name: string; address_name: string; road_address_name: string; x: string; y: string }>): void };
  };
};
declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

/** A point's address; zip and road are empty where Kakao has none. */
export type MapAddress = { lot: string; road: string; building: string; zip: string };

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_JS_KEY as string | undefined;
export const floorPlanMapAvailable = Boolean(KAKAO_KEY);

const KOREA = { lat: 36.3, lng: 127.8, level: 13 };
/** Spots closer than this (degrees, about 30m) can't be separated by zooming. */
const SAME_PLACE = 0.0003;
/** A click names the exact address only when zoomed in enough to aim at a building. */
const ADDRESS_CLICK_LEVEL = 4;
/** Length of one degree at Korea's latitude. */
const METRES_PER_LAT = 110_900;
const METRES_PER_LNG = 89_000;

let sdk: Promise<KakaoMaps> | null = null;
export function loadKakao(): Promise<KakaoMaps> {
  sdk ??= new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`;
    script.onload = () => (window.kakao ? window.kakao.maps.load(() => resolve(window.kakao!.maps)) : reject(new Error("no sdk")));
    script.onerror = () => reject(new Error("no sdk"));
    document.head.append(script);
  }).catch((error: unknown) => {
    sdk = null;
    throw error;
  });
  return sdk;
}

let data: Promise<MapData> | null = null;
/** After an admin changes the collection, the next map shows it. */
export function resetFloorPlanMapData() {
  data = null;
}
function loadSpots(authHeaders: AuthHeaders): Promise<MapData> {
  data ??= (async () => {
    const response = await fetch("/api/floorplans", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ action: "map" }) });
    const payload = (await response.json().catch(() => ({}))) as MapData & { error?: string };
    if (!response.ok) throw new Error(payload.error || "지도 정보를 불러오지 못했습니다.");
    return payload;
  })().catch((error: unknown) => {
    data = null;
    throw error;
  });
  return data;
}

export function FloorPlanMap({ authHeaders, focus, activeId, onSelect, onActiveAddress }: { authHeaders: AuthHeaders; focus?: string[]; activeId?: string; onSelect: (spot: DanjiInfo) => void; onActiveAddress?: (address: MapAddress | null) => void }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<{ error: string; shown: number; total: number } | null>(KAKAO_KEY ? null : { error: "지도 키(VITE_KAKAO_MAP_JS_KEY)가 설정되지 않았습니다.", shown: 0, total: 0 });
  const [stack, setStack] = useState<Spot[] | null>(null);
  const [place, setPlace] = useState("");
  const [address, setAddress] = useState<MapAddress | null>(null);
  const live = useRef<{ map: KakaoMap; maps: KakaoMaps; spots: Spot[]; draw: () => void; lookupAddress: (lat: number, lng: number) => Promise<MapAddress | null> } | null>(null);
  const reportAddress = useRef(onActiveAddress);
  const select = useRef(onSelect);
  const pinned = useRef({ activeId, focus });
  useEffect(() => {
    select.current = onSelect;
    reportAddress.current = onActiveAddress;
    pinned.current = { activeId, focus };
  });
  const focusKey = (focus ?? []).join(",");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!KAKAO_KEY) return;
    let cleanup: (() => void) | undefined;
    let alive = true;
    void (async () => {
      let maps: KakaoMaps;
      try {
        maps = await loadKakao();
      } catch {
        if (alive) setStatus({ error: "카카오 지도를 불러오지 못했습니다. 카카오 개발자 콘솔의 JS SDK 도메인에 이 주소가 등록되어 있는지 확인해 주세요.", shown: 0, total: 0 });
        return;
      }
      const loaded = await loadSpots(authHeaders);
      const host = canvas.current;
      if (!alive || !host) return;
      const spots: Spot[] = loaded.spots.map(([kbId, lat, lng, name, region, dong, count]) => ({ kbId, lat, lng, name, region: loaded.regions[region] ?? "", dong, count }));
      setStatus({ error: "", shown: spots.length, total: loaded.total });

      const map = new maps.Map(host, { center: new maps.LatLng(KOREA.lat, KOREA.lng), level: KOREA.level });
      map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      const overlays = new Map<string, Overlay>();

      const place = (key: string, lat: number, lng: number, content: HTMLElement, z: number) => {
        const overlay = new maps.CustomOverlay({ position: new maps.LatLng(lat, lng), content, xAnchor: 0.5, yAnchor: 0.5, clickable: true, zIndex: z });
        content.addEventListener("mouseenter", () => overlay.setZIndex(50));
        content.addEventListener("mouseleave", () => overlay.setZIndex(z));
        overlay.setMap(map);
        overlays.set(key, overlay);
      };

      const draw = () => {
        const view = map.getBounds();
        const south = view.getSouthWest().getLat(), west = view.getSouthWest().getLng();
        const north = view.getNorthEast().getLat(), east = view.getNorthEast().getLng();
        const level = map.getLevel();
        // Fixed per level (Kakao: 1px = 2^(level-3) m), so the grid stays put while panning and
        // clusters don't jump. Bounds can't be used here: they lag behind during a zoom.
        const metres = (level <= 3 ? 44 : 76) * 2 ** (level - 3);
        const cell = { lat: metres / METRES_PER_LAT, lng: metres / METRES_PER_LNG };
        const inView = (lat: number, lng: number) => lat > south - cell.lat && lat < north + cell.lat && lng > west - cell.lng && lng < east + cell.lng;

        const { activeId: active, focus: wanted } = pinned.current;
        const alone = new Set([...(wanted ?? []), ...(active ? [active] : [])]);
        const groups = new Map<string, Spot[]>();
        const singles: Spot[] = [];
        for (const spot of spots) {
          if (alone.has(spot.kbId)) {
            singles.push(spot);
            continue;
          }
          const key = `${Math.floor(spot.lat / cell.lat)}:${Math.floor(spot.lng / cell.lng)}`;
          const group = groups.get(key);
          if (group) group.push(spot);
          else groups.set(key, [spot]);
        }

        const wantedKeys = new Set<string>();
        const pin = (spot: Spot) => {
          if (!inView(spot.lat, spot.lng)) return;
          const isActive = spot.kbId === active;
          const key = `s:${spot.kbId}:${isActive ? 1 : 0}`;
          wantedKeys.add(key);
          if (overlays.has(key)) return;
          const button = document.createElement("button");
          button.type = "button";
          button.className = `fp-pin${isActive ? " is-active" : ""}`;
          button.textContent = "in";
          button.title = `${spot.name} · 도면 ${spot.count}개`;
          button.setAttribute("aria-label", button.title);
          button.addEventListener("click", () => {
            setStack(null);
            select.current(spot);
          });
          place(key, spot.lat, spot.lng, button, isActive ? 40 : 20);
        };
        singles.forEach(pin);

        for (const [groupKey, members] of groups) {
          if (members.length === 1) {
            pin(members[0]!);
            continue;
          }
          const lat = members.reduce((sum, m) => sum + m.lat, 0) / members.length;
          const lng = members.reduce((sum, m) => sum + m.lng, 0) / members.length;
          if (!inView(lat, lng)) continue;
          const key = `c:${level}:${groupKey}:${members.length}`;
          wantedKeys.add(key);
          if (overlays.has(key)) continue;
          const button = document.createElement("button");
          button.type = "button";
          button.className = `fp-cluster fp-cluster--${members.length >= 1000 ? "l" : members.length >= 100 ? "m" : "s"}`;
          button.textContent = members.length.toLocaleString();
          button.setAttribute("aria-label", `단지 ${members.length}곳`);
          button.addEventListener("click", () => {
            const lats = members.map((m) => m.lat), lngs = members.map((m) => m.lng);
            if (Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs)) < SAME_PLACE || map.getLevel() === 1) {
              setStack(members);
              return;
            }
            setStack(null);
            const bounds = new maps.LatLngBounds();
            members.forEach((m) => bounds.extend(new maps.LatLng(m.lat, m.lng)));
            map.setBounds(bounds, 70, 70, 70, 70);
          });
          place(key, lat, lng, button, 10);
        }

        for (const [key, overlay] of overlays) {
          if (!wantedKeys.has(key)) {
            overlay.setMap(null);
            overlays.delete(key);
          }
        }
      };

      // The area in view, only as detailed as the zoom level makes meaningful.
      const geocoder = new maps.services.Geocoder();
      let placeRequest = 0;
      const nameView = () => {
        const level = map.getLevel();
        const request = ++placeRequest;
        if (level >= 12) {
          setPlace("");
          return;
        }
        const center = map.getCenter();
        geocoder.coord2RegionCode(center.getLng(), center.getLat(), (found, status) => {
          if (!alive || request !== placeRequest) return;
          const area = status === maps.services.Status.OK ? found.find((item) => item.region_type === "B") ?? found[0] : undefined;
          setPlace(area ? [area.region_1depth_name, level <= 9 ? area.region_2depth_name : "", level <= 6 ? area.region_3depth_name : ""].filter(Boolean).join(" ") : "");
        });
      };

      let clickDot: Overlay | null = null;
      let addressRequest = 0;
      const removeDot = () => {
        clickDot?.setMap(null);
        clickDot = null;
      };
      /** A point inside a complex often has a lot number but no road address, so the lot is looked up for the zip. */
      const lookupAddress = (lat: number, lng: number) =>
        new Promise<MapAddress | null>((resolve) => {
          geocoder.coord2Address(lng, lat, (found, status) => {
            const hit = status === maps.services.Status.OK ? found[0] : undefined;
            if (!hit) {
              resolve(null);
              return;
            }
            const lot = hit.address?.address_name ?? "";
            const finish = (road: GeocoderAddress["road_address"] | undefined) => resolve({ lot, road: road?.address_name ?? "", building: road?.building_name ?? "", zip: road?.zone_no ?? "" });
            if (hit.road_address?.zone_no || !lot) finish(hit.road_address);
            else geocoder.addressSearch(lot, (more, moreStatus) => finish((moreStatus === maps.services.Status.OK ? more[0]?.road_address : null) ?? hit.road_address));
          });
        });
      const onMapClick = (event?: { latLng: LatLng }) => {
        if (!event || map.getLevel() > ADDRESS_CLICK_LEVEL) return;
        const lat = event.latLng.getLat(), lng = event.latLng.getLng();
        const request = ++addressRequest;
        void lookupAddress(lat, lng).then((hit) => {
          if (!alive || request !== addressRequest) return;
          removeDot();
          setAddress(hit);
          if (!hit) return;
          const content = document.createElement("div");
          content.className = "fp-map__dot";
          clickDot = new maps.CustomOverlay({ position: new maps.LatLng(lat, lng), content, xAnchor: 0.5, yAnchor: 0.5, clickable: false, zIndex: 5 });
          clickDot.setMap(map);
        });
      };
      // Only the viewer moving the map clears it: opening a pin's panel also pans.
      const clearAddress = () => {
        addressRequest += 1;
        removeDot();
        setAddress(null);
      };

      maps.event.addListener(map, "idle", draw);
      maps.event.addListener(map, "idle", nameView);
      maps.event.addListener(map, "zoom_changed", draw);
      maps.event.addListener(map, "click", onMapClick);
      maps.event.addListener(map, "dragstart", clearAddress);
      maps.event.addListener(map, "zoom_start", clearAddress);
      const resize = new ResizeObserver(() => map.relayout());
      resize.observe(host);
      draw();
      live.current = { map, maps, spots, draw, lookupAddress };
      setReady(true);
      cleanup = () => {
        maps.event.removeListener(map, "idle", draw);
        maps.event.removeListener(map, "idle", nameView);
        maps.event.removeListener(map, "click", onMapClick);
        maps.event.removeListener(map, "dragstart", clearAddress);
        maps.event.removeListener(map, "zoom_start", clearAddress);
        removeDot();
        maps.event.removeListener(map, "zoom_changed", draw);
        resize.disconnect();
        overlays.forEach((overlay) => overlay.setMap(null));
        overlays.clear();
        live.current = null;
      };
    })().catch((error: unknown) => {
      if (alive) setStatus({ error: error instanceof Error ? error.message : "지도를 불러오지 못했습니다.", shown: 0, total: 0 });
    });
    return () => {
      alive = false;
      cleanup?.();
    };
    // authHeaders is recreated each render; the map is built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = live.current;
    if (!current || !focusKey) return;
    const ids = new Set(focusKey.split(","));
    const targets = current.spots.filter((spot) => ids.has(spot.kbId));
    if (targets.length === 1) {
      current.map.setLevel(3);
      current.map.setCenter(new current.maps.LatLng(targets[0]!.lat, targets[0]!.lng));
    } else if (targets.length > 1) {
      const bounds = new current.maps.LatLngBounds();
      targets.forEach((spot) => bounds.extend(new current.maps.LatLng(spot.lat, spot.lng)));
      current.map.setBounds(bounds, 70, 70, 70, 70);
    }
    current.draw();
  }, [focusKey, ready]);

  useEffect(() => {
    const current = live.current;
    if (!current) return;
    current.draw();
    reportAddress.current?.(null);
    const target = activeId ? current.spots.find((spot) => spot.kbId === activeId) : undefined;
    if (!target) return;
    let active = true;
    void current.lookupAddress(target.lat, target.lng).then((found) => {
      if (active) reportAddress.current?.(found);
    });
    // Opening the side panel narrows the map, so wait for that before centring the pin.
    const timer = window.setTimeout(() => {
      current.map.relayout();
      current.map.panTo(new current.maps.LatLng(target.lat, target.lng));
    }, 60);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeId, ready]);

  return (
    <div className="fp-map">
      <div className="fp-map__canvas" ref={canvas} />
      {!status?.error && address ? (
        <div className="fp-map__place fp-map__place--address">
          {address.building && <strong>{address.building}</strong>}
          <span>{address.road || address.lot}</span>
          {(address.road && address.lot) || address.zip ? <small>{[address.road && address.lot ? `지번 ${address.lot}` : "", address.zip ? `우편번호 ${address.zip}` : ""].filter(Boolean).join(" · ")}</small> : null}
        </div>
      ) : !status?.error && place ? <p className="fp-map__place">{place}</p> : null}
      {status?.error ? <p className="fp-map__notice">{status.error}</p> : null}
      {status && !status.error ? <p className="fp-map__count">단지 {status.shown.toLocaleString()}곳{status.total > status.shown ? ` · 위치를 확인하지 못한 ${(status.total - status.shown).toLocaleString()}곳 제외` : ""}</p> : null}
      {stack ? (
        <div className="fp-map__stack">
          <p>같은 위치의 단지</p>
          {stack.slice(0, 12).map((spot) => (
            <button type="button" key={spot.kbId} onClick={() => { setStack(null); onSelect(spot); }}>{spot.name} <small>도면 {spot.count}개</small></button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
