/**
 * Choosing a complex's location: search an address or place name, or click the map, and the black
 * "in" pin moves there. The chosen address comes back so a new complex can fill in its region.
 */
import { useEffect, useRef, useState } from "react";
import { loadKakao, type KakaoMap, type KakaoMaps, type Overlay } from "./FloorPlanMap";

export type PickedPlace = { lat: number; lng: number; name?: string; address?: string };
type Candidate = PickedPlace & { label: string; detail: string };

const KOREA = { lat: 36.3, lng: 127.8, level: 13 };

export function FloorPlanLocationPicker({ value, initialQuery, onPick }: { value: { lat: number; lng: number } | null; initialQuery?: string; onPick: (place: PickedPlace) => void }) {
  const canvas = useRef<HTMLDivElement>(null);
  const live = useRef<{ map: KakaoMap; maps: KakaoMaps; pin: Overlay | null } | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });
  const start = useRef({ value, initialQuery });
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let cleanup: (() => void) | undefined;
    loadKakao().then((maps) => {
      const host = canvas.current;
      if (!alive || !host) return;
      const first = start.current.value;
      const map = new maps.Map(host, { center: new maps.LatLng(first?.lat ?? KOREA.lat, first?.lng ?? KOREA.lng), level: first ? 3 : KOREA.level });
      map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      const geocoder = new maps.services.Geocoder();
      if (!first && start.current.initialQuery) {
        geocoder.addressSearch(start.current.initialQuery, (found, status) => {
          if (status === maps.services.Status.OK && found[0]) {
            map.setLevel(5);
            map.setCenter(new maps.LatLng(Number(found[0].y), Number(found[0].x)));
          }
        });
      }
      const onClick = (event?: { latLng: { getLat(): number; getLng(): number } }) => {
        if (!event) return;
        const lat = event.latLng.getLat(), lng = event.latLng.getLng();
        geocoder.coord2Address(lng, lat, (found, status) => {
          const hit = status === maps.services.Status.OK ? found[0] : undefined;
          pick.current({ lat, lng, address: hit?.address?.address_name, name: hit?.road_address?.building_name || undefined });
        });
      };
      maps.event.addListener(map, "click", onClick);
      const resize = new ResizeObserver(() => map.relayout());
      resize.observe(host);
      live.current = { map, maps, pin: null };
      setReady(true);
      cleanup = () => {
        maps.event.removeListener(map, "click", onClick);
        resize.disconnect();
        live.current = null;
      };
    }).catch(() => {
      if (alive) setError("카카오 지도를 불러오지 못했습니다. 지도 키와 등록 도메인을 확인해 주세요.");
    });
    return () => {
      alive = false;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const current = live.current;
    if (!current) return;
    if (!value) {
      current.pin?.setMap(null);
      current.pin = null;
      return;
    }
    const position = new current.maps.LatLng(value.lat, value.lng);
    if (current.pin) current.pin.setPosition(position);
    else {
      const content = document.createElement("div");
      content.className = "fp-pin is-active";
      content.textContent = "in";
      current.pin = new current.maps.CustomOverlay({ position, content, xAnchor: 0.5, yAnchor: 0.5, clickable: false, zIndex: 20 });
      current.pin.setMap(current.map);
    }
  }, [value, ready]);

  async function search() {
    const current = live.current;
    const text = query.trim();
    if (!current || !text) return;
    setError("");
    const { services } = current.maps;
    const [addresses, places] = await Promise.all([
      new Promise<Candidate[]>((resolve) => new services.Geocoder().addressSearch(text, (found, status) => resolve(status === services.Status.OK ? found.map((item) => {
        const address = item.address?.address_name ?? item.address_name;
        return { lat: Number(item.y), lng: Number(item.x), address, name: item.road_address?.building_name || undefined, label: item.road_address?.building_name || item.address_name, detail: address };
      }) : []))),
      new Promise<Candidate[]>((resolve) => new services.Places().keywordSearch(text, (found, status) => resolve(status === services.Status.OK ? found.map((item) => ({ lat: Number(item.y), lng: Number(item.x), address: item.address_name, name: item.place_name, label: item.place_name, detail: item.road_address_name || item.address_name })) : []))),
    ]);
    const seen = new Set<string>();
    const merged = [...addresses, ...places].filter((item) => {
      const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
    setResults(merged);
  }

  function choose(item: Candidate) {
    const current = live.current;
    if (current) {
      current.map.setLevel(3);
      current.map.setCenter(new current.maps.LatLng(item.lat, item.lng));
    }
    setResults(null);
    if (!current) return;
    // A road-name result has no 동, so the lot address is always looked up from the point itself.
    const { services } = current.maps;
    new services.Geocoder().coord2Address(item.lng, item.lat, (found, status) => {
      const hit = status === services.Status.OK ? found[0] : undefined;
      onPick({ lat: item.lat, lng: item.lng, name: item.name ?? (hit?.road_address?.building_name || undefined), address: hit?.address?.address_name ?? item.address });
    });
  }

  return (
    <div className="fpm-picker">
      <div className="fpm-picker__search">
        <input
          type="search"
          value={query}
          placeholder="주소 또는 아파트 이름 (예: 서울 양천구 목동중앙서로 10길)"
          aria-label="주소 검색"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => void search()}>주소 찾기</button>
      </div>
      {results && (results.length ? (
        <div className="fpm-picker__results">
          {results.map((item) => (
            <button type="button" key={`${item.lat},${item.lng}`} onClick={() => choose(item)}><strong>{item.label}</strong><span>{item.detail}</span></button>
          ))}
        </div>
      ) : <p className="fpm-help">검색 결과가 없습니다. 주소를 바꿔 보거나 지도에서 직접 눌러 주세요.</p>)}
      <div className="fpm-picker__map"><div ref={canvas} className="fp-map__canvas" /></div>
      {error ? <p className="admin-note admin-note--error">{error}</p> : <p className="fpm-help">지도를 누르면 그 자리로 핀이 옮겨집니다.</p>}
    </div>
  );
}
