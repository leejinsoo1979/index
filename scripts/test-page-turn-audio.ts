import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PageTurnAudio, PAGE_TURN_RECORDING } from "../src/components/flipbook/PageTurnAudio";

test("the default asset is the user's unmodified MP3", () => {
  const bytes = readFileSync(new URL(`../public${PAGE_TURN_RECORDING}`, import.meta.url));
  assert.equal(bytes.length, 39168);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "600be61dd4591f09cdc1711fa8e07098fd3d948f619a7e096513ed6ab5aa82d8");
});

test("recording playback stays silent until requested; mute and disposal cancel pending audio", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const contexts: Context[] = [];
  const urls: string[] = [];
  const gains: number[] = [];
  let started = 0, stopped = 0;
  let release: (() => void) | null = null;
  let deferDecode = false;
  class Context {
    state = "suspended";
    destination = {};
    constructor() { contexts.push(this); }
    async resume() { this.state = "running"; }
    async close() { this.state = "closed"; }
    async decodeAudioData(bytes: ArrayBuffer) {
      assert.deepEqual([...new Uint8Array(bytes)], [73, 68, 51]);
      if (deferDecode) await new Promise<void>(resolve => { release = resolve; });
      return { duration: 1.224 };
    }
    createBufferSource() {
      return { buffer: null, onended: null, connect(node: unknown) { return node; }, disconnect() {}, start() { started++; }, stop() { stopped++; } };
    }
    createGain() {
      return { gain: { set value(v: number) { gains.push(v); } }, connect() {}, disconnect() {} };
    }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { AudioContext: Context } });
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    return { ok: true, arrayBuffer: async () => Uint8Array.of(73, 68, 51).buffer };
  }) as typeof fetch;
  try {
    PageTurnAudio.preload();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(contexts.length, 0, "preloading does not create or start an audio context");
    const audio = new PageTurnAudio();
    await audio.play("none", .4);
    assert.equal(contexts.length, 0);
    assert.equal(await audio.play("paper", .4), true);
    assert.equal(started, 1);
    assert.equal(gains.at(-1), .4);
    await audio.play("soft", .4);
    assert.equal(started, 2);
    assert.equal(stopped, 1, "rapid turns replace the previous recording");
    assert.ok(Math.abs(gains.at(-1)! - .18) < .000001);
    assert.deepEqual(urls, [PAGE_TURN_RECORDING], "both levels use the same supplied file");
    await audio.play("paper", .4, -1);
    assert.equal(started, 2, "a late load never plays out of sync");
    audio.dispose();
    assert.equal(contexts[0].state, "closed");

    deferDecode = true;
    const pendingAudio = new PageTurnAudio();
    const pending = pendingAudio.play("paper", .4);
    await new Promise(resolve => setTimeout(resolve, 0));
    pendingAudio.stop();
    assert.ok(release);
    (release as () => void)();
    await pending;
    assert.equal(started, 2, "muting while decoding prevents late playback");
    pendingAudio.dispose();
    assert.equal(contexts[1].state, "closed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
