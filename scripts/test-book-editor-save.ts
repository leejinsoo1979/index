import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

test("leaving waits for the latest save, and a failed save remains retryable", async () => {
  const fixture = { id: "save-test", title: "Original", pages: [], assets: [], updatedAt: 0 };
  const state = globalThis as any;
  const previous = { window: state.window, fixture: state.__bookSaveFixture, save: state.__bookSaveRequest };
  state.window = { clearTimeout() {}, setTimeout() { return 0; }, addEventListener() {}, removeEventListener() {} };
  state.__bookSaveFixture = fixture;
  const output = await build({
    entryPoints: ["src/pages/admin/book-editor/useBookEditor.ts"], bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "save-io", setup(plugin) {
      plugin.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "save-test" }));
      plugin.onResolve({ filter: /lib\/flipbooks$/ }, () => ({ path: "books", namespace: "save-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "save-test" }, ({ path }) => ({ contents: path === "react" ? `
        export const useRef=value=>({current:value});
        export const useState=value=>[typeof value==='function'?value():value,()=>{}];
        export const useCallback=fn=>fn;
        export const useEffect=fn=>{fn()};
      ` : `
        export const getFlipbook=async()=>globalThis.__bookSaveFixture;
        export const saveFlipbook=book=>globalThis.__bookSaveRequest(book);
        export const uid=()=>'';
        export const convertPdf=()=>{};export const prepareImage=()=>{};export const uploadBookFile=()=>{};
      ` }));
    } }],
  });
  try {
    const module = { exports: {} as any };
    new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
    const editor = module.exports.useBookEditor(fixture.id);
    await Promise.resolve(); // initial document load
    assert.equal(await editor.flush(), true, "an unchanged book can leave immediately");

    const saved: string[] = [];
    const release: (() => void)[] = [];
    state.__bookSaveRequest = (book: typeof fixture) => { saved.push(book.title); return new Promise<void>(resolve => release.push(resolve)); };
    editor.commit((book: typeof fixture) => ({ ...book, title: "First edit" }));
    const autosave = editor.flush();
    editor.commit((book: typeof fixture) => ({ ...book, title: "Latest edit" }));
    let finished = false;
    const exitSave = editor.flush().then((ok: boolean) => { finished = true; return ok; });
    assert.equal(saved.length, 1, "an active write is not duplicated");
    release[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(saved, ["First edit", "Latest edit"]);
    assert.equal(finished, false, "leaving still waits for changes made during autosave");
    release[1]();
    assert.equal(await exitSave, true);
    assert.equal(await autosave, true);

    editor.commit((book: typeof fixture) => ({ ...book, title: "Unsaved edit" }));
    state.__bookSaveRequest = async () => { throw new Error("offline"); };
    assert.equal(await editor.flush(), false, "a failed write blocks leaving");
    assert.equal(editor.snapshot().title, "Unsaved edit", "the edit survives a failure");
    state.__bookSaveRequest = async (book: typeof fixture) => { saved.push(book.title); };
    assert.equal(await editor.flush(), true);
    assert.equal(saved.at(-1), "Unsaved edit", "retry writes the retained edit");
  } finally {
    if (previous.window === undefined) delete state.window; else state.window = previous.window;
    if (previous.fixture === undefined) delete state.__bookSaveFixture; else state.__bookSaveFixture = previous.fixture;
    if (previous.save === undefined) delete state.__bookSaveRequest; else state.__bookSaveRequest = previous.save;
  }
});
