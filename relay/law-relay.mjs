// Fixed-IP relay for the 법제처 국가법령정보 OPEN API (law.go.kr).
//
// law.go.kr only answers requests from server IPs registered for the OC key, and Vercel
// (Hobby) has no fixed egress IP. Run this on any always-on host with a static public IP,
// register that IP at open.law.go.kr, and point Vercel at it:
//   LAW_RELAY_URL=https://<this host>   LAW_RELAY_SECRET=<same value as RELAY_SECRET here>
//
// Run:  RELAY_SECRET=... PORT=8787 node law-relay.mjs     (Node 18+, no dependencies)
// It forwards only GET /DRF/lawSearch.do and /DRF/lawService.do, and requires the
// x-relay-secret header, so it can't be used as an open proxy.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const SECRET = process.env.RELAY_SECRET ?? "";
const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED = new Set(["/DRF/lawSearch.do", "/DRF/lawService.do"]);
if (SECRET.length < 16) {
  console.error("RELAY_SECRET (16자 이상)를 설정해 주세요.");
  process.exit(1);
}

const sameSecret = (value) => {
  const a = Buffer.from(String(value ?? ""));
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://relay");
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (req.method !== "GET" || !ALLOWED.has(url.pathname)) {
    res.writeHead(404).end();
    return;
  }
  if (!sameSecret(req.headers["x-relay-secret"])) {
    res.writeHead(401).end();
    return;
  }
  try {
    const upstream = await fetch(`https://www.law.go.kr${url.pathname}${url.search}`, { signal: AbortSignal.timeout(20_000) });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/xml" }).end(body);
  } catch (error) {
    console.error("[law-relay]", error);
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" }).end("법제처 API에 연결하지 못했습니다.");
  }
}).listen(PORT, () => console.log(`law relay listening on :${PORT}`));
