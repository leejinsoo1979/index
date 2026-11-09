import { createHash, createHmac } from "node:crypto";

/** Cloudflare R2 (S3 API, SigV4) for the public media bucket: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL. */
const env = () => ({
  account: process.env.R2_ACCOUNT_ID?.trim() ?? "",
  accessKey: process.env.R2_ACCESS_KEY_ID?.trim() ?? "",
  secret: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
  bucket: process.env.R2_BUCKET?.trim() ?? "",
  publicBase: process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "") ?? "",
});

export const isR2Configured = () => Object.values(env()).every(Boolean);

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
const amzDate = () => new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (key: string) => key.split("/").map(encode).join("/");

function signature(secret: string, amz: string, canonical: string) {
  const day = amz.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), "auto"), "s3"), "aws4_request");
  return { scope, value: createHmac("sha256", key).update(["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n")).digest("hex") };
}

const query = (pairs: [string, string][]) => pairs.map(([k, v]) => `${encode(k)}=${encode(v)}`).sort().join("&");

export const r2PublicUrl = (key: string) => `${env().publicBase}/${encodePath(key)}`;

/**
 * An address the browser can PUT exactly one file to, for a short time. Type and size are part of the
 * signature, so the upload has to be the file the server agreed to. Big files can't pass through a
 * Vercel function (4.5MB body limit), which is why the browser talks to R2 directly.
 */
export function r2PresignPut(key: string, contentType: string, size: number, cacheControl: string, expires = 900): string {
  const { account, accessKey, secret, bucket } = env();
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${encodePath(key)}`;
  const amz = amzDate();
  const signedHeaders = "cache-control;content-length;content-type;host";
  const headers = `cache-control:${cacheControl}\ncontent-length:${size}\ncontent-type:${contentType}\nhost:${host}\n`;
  const scope = `${amz.slice(0, 8)}/auto/s3/aws4_request`;
  const search = query([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKey}/${scope}`],
    ["X-Amz-Date", amz],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]);
  const canonical = ["PUT", path, search, headers, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  return `https://${host}${path}?${search}&X-Amz-Signature=${signature(secret, amz, canonical).value}`;
}

async function call(method: "GET" | "DELETE", path: string, search: string) {
  const { account, accessKey, secret } = env();
  const host = `${account}.r2.cloudflarestorage.com`;
  const amz = amzDate();
  const payload = "UNSIGNED-PAYLOAD";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [method, path, search, `host:${host}\nx-amz-content-sha256:${payload}\nx-amz-date:${amz}\n`, signedHeaders, payload].join("\n");
  const signed = signature(secret, amz, canonical);
  return fetch(`https://${host}${path}${search ? `?${search}` : ""}`, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      "x-amz-date": amz,
      "x-amz-content-sha256": payload,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${signed.scope}, SignedHeaders=${signedHeaders}, Signature=${signed.value}`,
    },
  });
}

/** Deletes everything under a prefix and returns how many objects went. */
export async function r2DeletePrefix(prefix: string): Promise<number> {
  if (!prefix.endsWith("/") || prefix.length < 2) throw new Error("삭제 경로가 올바르지 않습니다.");
  const { bucket } = env();
  let deleted = 0;
  let token = "";
  do {
    const pairs: [string, string][] = [["list-type", "2"], ["prefix", prefix]];
    if (token) pairs.push(["continuation-token", token]);
    const res = await call("GET", `/${bucket}`, query(pairs));
    if (!res.ok) throw new Error(`R2 목록 조회 실패 (${res.status})`);
    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const results = await Promise.all(keys.map((key) => call("DELETE", `/${bucket}/${encodePath(key)}`, "")));
    const failed = results.find((item) => !item.ok && item.status !== 404);
    if (failed) throw new Error(`R2 삭제 실패 (${failed.status})`);
    deleted += keys.length;
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? /<NextContinuationToken>([^<]+)</.exec(xml)?.[1] ?? "" : "";
  } while (token);
  return deleted;
}
