import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

const hmrServer = createHttpServer();
const server = await createServer({ mode: 'test', server: { middlewareMode: true, hmr: { server: hmrServer } }, appType: 'custom', logLevel: 'error' });
try {
  const { createLocalWikiRepository } = await server.ssrLoadModule('/src/archi/wiki/repository.ts');
  const { emptyWikiDraft, WikiConflictError } = await server.ssrLoadModule('/src/archi/wiki/types.ts');
  const { wikiLinks, rewriteWikiLinks, headings, plainText, resolvePage, searchPages, pageGraph } = await server.ssrLoadModule('/src/archi/wiki/markdown.ts');
  const { coverForPage } = await server.ssrLoadModule('/src/archi/wiki/covers.ts');
  const { encyclopediaArticles, indexLetter, wantedArticles, encyclopediaDraft, articleLead } = await server.ssrLoadModule('/src/archi/wiki/encyclopedia.ts');
  const { buildKnowledgeGraph, graphLayoutSettings, applyGraphFocus } = await server.ssrLoadModule('/src/archi/web/components/ontology/graph-model.ts');
  const { default: forceAtlas2 } = await import('graphology-layout-forceatlas2');
  const { default: randomLayout } = await import('graphology-layout/random.js');
  function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; }

  await test('page + immutable revision survive a new repository instance; workspaces remain isolated', async () => {
    const disk = storage();
    const repo = createLocalWikiRepository('workspace-a', '관리자', disk);
    const page = await repo.save({ ...emptyWikiDraft('욕실 방수'), content: '원문 기록', tags: ['방수', '방수', ''] }, { expectedVersion: 0 });
    assert.deepEqual(page.tags, ['방수']);
    const reopened = createLocalWikiRepository('workspace-a', '관리자', disk);
    assert.equal((await reopened.list())[0].content, '원문 기록');
    assert.equal((await reopened.history(page.id)).length, 1);
    assert.equal((await createLocalWikiRepository('workspace-b', '관리자', disk).list()).length, 0);
  });

  await test('stale edits are rejected; restore creates a new version and rename preserves incoming links', async () => {
    const repo = createLocalWikiRepository('versions', '검수자', storage());
    const first = await repo.save({ ...emptyWikiDraft('방수'), content: '첫 기록' }, { expectedVersion: 0 });
    const renamed = await repo.save({ ...first, title: '욕실 방수', content: '두 번째 기록' }, { id: first.id, expectedVersion: 1 });
    await assert.rejects(repo.save({ ...first, content: '오래된 창' }, { id: first.id, expectedVersion: 1 }), WikiConflictError);
    assert.equal(resolvePage('방수', [renamed]).id, first.id);
    const restored = await repo.save(first, { id: first.id, expectedVersion: 2, reason: 'v1에서 복원' });
    assert.equal(restored.version, 3); assert.equal(restored.content, '첫 기록');
    assert.deepEqual((await repo.history(first.id)).map(row => row.version), [3, 2, 1]);
    assert.equal((await repo.history(first.id))[1].content, '두 번째 기록');
  });

  await test('storage failures propagate and do not create phantom versions', async () => {
    const disk = storage();
    const repo = createLocalWikiRepository('failures', '관리자', disk);
    const first = await repo.save(emptyWikiDraft('자료'), { expectedVersion: 0 });
    disk.setItem = () => { throw new Error('quota exceeded'); };
    await assert.rejects(repo.save({ ...first, content: '저장 실패' }, { id: first.id, expectedVersion: 1 }), /quota/);
    assert.equal((await repo.list())[0].version, 1);
    assert.equal((await repo.history(first.id)).length, 1);
  });

  await test('links ignore code; aliases render correctly; links safely encode punctuation', () => {
    const raw = '[[방수|방수 가이드]] [[결로]]\n\n`[[코드]]`\n\n```md\n[[예제]]\n```';
    assert.deepEqual(wikiLinks(raw + '\n<!-- [[작성 도움말]] -->'), ['방수', '결로']);
    assert.match(rewriteWikiLinks(raw), /방수 가이드/);
    assert.match(rewriteWikiLinks('[[기준(2026)]]'), /%282026%29/);
    assert.equal(plainText('[[방수|가이드]]'), '가이드');
    assert.deepEqual(headings('# 소개\n```md\n# 예제\n```\n## 핵심'), [{ level: 1, text: '소개', id: 'wiki-heading-0' }, { level: 2, text: '핵심', id: 'wiki-heading-4' }]);
  });

  await test('full-text search uses all terms; graph excludes archived, missing, and self links', async () => {
    const repo = createLocalWikiRepository('graph', '관리자', storage());
    const first = await repo.save({ ...emptyWikiDraft('방수'), content: '욕실 현장 [[결로]] [[없는 문서]] [[방수]]' }, { expectedVersion: 0 });
    const second = await repo.save({ ...emptyWikiDraft('결로'), content: '욕실 단열 현장', tags: ['하자'] }, { expectedVersion: 0 });
    const archived = await repo.save({ ...emptyWikiDraft('보관'), status: 'archived' }, { expectedVersion: 0 });
    assert.equal(searchPages([first, second], '욕실 단열')[0].id, second.id);
    assert.equal(searchPages([first, second], '없는검색어').length, 0);
    const graph = pageGraph([first, second, archived]);
    assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].targetNodeId, second.id);
  });

  await test('generated covers match the title; an explicit cover survives save and reload', async () => {
    assert.equal(coverForPage({ title: '타일 들뜸', category: '공법', tags: [] }), 'tile-defect');
    assert.equal(coverForPage({ title: '결로와 단열', category: '공법', tags: [] }), 'condensation');
    assert.equal(coverForPage({ title: '욕실 방수', category: '일반', tags: [] }), 'waterproofing');
    const disk = storage(), repo = createLocalWikiRepository('covers', '관리자', disk);
    const page = await repo.save({ ...emptyWikiDraft('방수'), cover: 'materials' }, { expectedVersion: 0 });
    const reopened = (await createLocalWikiRepository('covers', '관리자', disk).list())[0];
    assert.equal(coverForPage(reopened), 'materials');
    assert.equal((await repo.history(page.id))[0].cover, 'materials');
  });

  await test('encyclopedia excludes sources, notes and unreviewed entries by default; Korean index and wanted links work', async () => {
    const repo = createLocalWikiRepository('encyclopedia', '편집자', storage());
    const first = await repo.save({ ...encyclopediaDraft('공간 계획'), status: 'published', content: '주거 공간을 계획합니다. [[수납]] [[Storage]]' }, { expectedVersion: 0 });
    const second = await repo.save({ ...encyclopediaDraft('주거 동선'), status: 'review', content: '[[수납]]' }, { expectedVersion: 0 });
    const source = await repo.save({ ...emptyWikiDraft('자료 요약'), entryType: 'source', status: 'published' }, { expectedVersion: 0 });
    const note = await repo.save({ ...emptyWikiDraft('회의 기록'), entryType: 'note', status: 'published' }, { expectedVersion: 0 });
    assert.deepEqual(encyclopediaArticles([note, source, second, first]).map(page => page.id), [first.id]);
    assert.equal(encyclopediaArticles([note, source, second, first], true).length, 2);
    assert.equal(indexLetter('까치집'), 'ㄱ'); assert.equal(indexLetter(' 주거'), 'ㅈ');
    assert.equal(indexLetter('LLM Wiki'), 'A–Z'); assert.equal(indexLetter('2026 기준'), '0–9');
    assert.equal(indexLetter('ⓘ 안내'), '기타');
    assert.deepEqual(wantedArticles([first, second]), [{ title: '수납', count: 2 }, { title: 'Storage', count: 1 }]);
    assert.equal(articleLead('## 개요\n\n<!-- 작성 도움말 -->\n\n주거의 생활 동선을 정리합니다.'), '주거의 생활 동선을 정리합니다.');
    assert.equal((await repo.history(source.id))[0].entryType, 'source');
    const renamed = { ...first, title: '주거 공간 계획', aliases: ['공간 계획'] };
    const exact = { ...second, title: '공간 계획' };
    assert.equal(resolvePage('공간 계획', [renamed, exact]).id, exact.id);
    assert.equal(searchPages([renamed], '공간 계획')[0].id, first.id);
  });

  await test('Graphology ForceAtlas2 handles connected, disconnected and single-note graphs without invented nodes', () => {
    for (const size of [1, 4, 120]) {
      const nodes = Array.from({ length: size }, (_, i) => ({ id: 'node-' + i, label: '주거 지식 항목 ' + i, type: '설계', status: 'APPROVED' }));
      const edges = nodes.slice(1, Math.max(1, size - 2)).map((node, i) => ({ id: 'link-' + i, sourceNodeId: nodes[i].id, targetNodeId: node.id, relationType: '관련 항목', status: 'APPROVED' }));
      const graph = buildKnowledgeGraph(nodes, edges);
      // Seed only the test fixture; library random initialization otherwise makes the rounded-position assertion flaky.
      let seed = 42;
      randomLayout.assign(graph, { scale: 100, rng: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) });
      if (graph.order > 1) forceAtlas2.assign(graph, { iterations: 100, settings: graphLayoutSettings(graph) });
      assert.equal(graph.order, nodes.length);
      const positions = graph.mapNodes((_id, data) => data);
      assert.ok(positions.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
      if (size > 1) assert.equal(new Set(positions.map(p => p.x.toFixed(2) + ':' + p.y.toFixed(2))).size, size);
    }
  });
  await test('Graphology merges reciprocal note links, rejects dangling/self edges, and focuses actual neighbors', () => {
    const nodes = [ { id: 'a:[]', label: '공간 계획', type: '설계', status: 'APPROVED' }, { id: 'edge-1', label: '주거 동선', type: '설계', status: 'CANDIDATE' }, { id: 'isolated', label: '자재', type: '자재', status: 'APPROVED' } ];
    const edge = { id: 'a:[]', sourceNodeId: nodes[0].id, targetNodeId: nodes[1].id, relationType: '관련', status: 'APPROVED' };
    const edges = [edge, { ...edge, id: 'reverse', sourceNodeId: edge.targetNodeId, targetNodeId: edge.sourceNodeId }, { ...edge, id: 'missing', sourceNodeId: 'missing' }, { ...edge, id: 'self', targetNodeId: edge.sourceNodeId }];
    const graph = buildKnowledgeGraph([...nodes, nodes[0]], edges);
    assert.equal(graph.order, 3); assert.equal(graph.size, 1);
    applyGraphFocus(graph, nodes[0].id, null, '');
    assert.equal(graph.getNodeAttribute(nodes[0].id, 'active'), true);
    assert.equal(graph.getNodeAttribute('isolated', 'dimmed'), true);
    assert.equal(graph.getNodeAttribute(nodes[1].id, 'dimmed'), false);
    applyGraphFocus(graph, null, null, '주거 동선');
    assert.equal(graph.getNodeAttribute(nodes[1].id, 'active'), true);
    applyGraphFocus(graph, null, null, '없는 검색어');
    assert.equal(graph.filterNodes((_id, data) => data.dimmed).length, 3);
    applyGraphFocus(graph, null, null, '');
    assert.equal(graph.filterNodes((_id, data) => data.dimmed).length, 0);
    assert.equal(buildKnowledgeGraph(nodes, edges, false).hasNode('isolated'), false);
  });

  await test('existing documents import as source-linked drafts and enforce workspace access', async () => {
    const { prisma } = await server.ssrLoadModule('/src/archi/db/index.ts');
    const { devLogin } = await server.ssrLoadModule('/src/archi/web/lib/services/auth.ts');
    const { listWikiImports, draftFromExisting } = await server.ssrLoadModule('/src/archi/wiki/sources.ts');
    const session = await devLogin({ email: 'wiki-import-test@example.invalid' });
    const workspaceId = session.workspaces[0].id;
    const project = await prisma.project.create({ data: { name: '검증 프로젝트', workspaceId } });
    const document = await prisma.document.create({ data: { projectId: project.id, title: '원본 기술자료', status: 'APPROVED', type: 'REPORT', blocks: { create: [
      { type: 'heading', sortOrder: 0, content: { text: '현장 기록' } },
      { type: 'paragraph', sortOrder: 1, content: { text: '원본의 기술 내용을 보존합니다.' } },
      { type: 'table', sortOrder: 2, content: { headers: ['항목', '기록'], rows: [['접합부', '원문 | 확인']] } },
    ] } } });
    const item = (await listWikiImports(session.user.id, workspaceId)).find(row => row.id === document.id);
    assert.ok(item);
    const draft = await draftFromExisting(session.user.id, workspaceId, item);
    assert.equal(draft.status, 'draft');
    assert.match(draft.content, /## 현장 기록/);
    assert.ok(draft.content.includes('원문 \\| 확인'));
    assert.equal(draft.sources[0].id, document.id);
    assert.equal(draft.sources[0].href, '/agent-studio/' + document.id);
    const outsider = await devLogin({ email: 'wiki-outsider@example.invalid' });
    await assert.rejects(draftFromExisting(outsider.user.id, workspaceId, item), /권한/);
  });

  const { readProcess, writeProcess, parseProcess, withoutProcess, registryRecords, knowledgeConnectionModel, documentSections } = await server.ssrLoadModule('/src/archi/wiki/registry.ts');
  const processFixture = {
    lanes: ['설계자', '관리자'], stages: ['G0 검토', 'G1 승인'],
    nodes: [
      { id: 'P01', name: '설계 검토', lane: '설계자', stage: 'G0 검토', type: 'task', status: 'current', actor: '설계자', source_ids: ['source-a'] },
      { id: 'P02', name: '승인', lane: '관리자', stage: 'G1 승인', type: 'gateway', status: 'waiting', actor: '관리자' },
    ],
    edges: [{id:'E01',source:'P01',target:'P02',type:'sequence'}],
  };
  await test('Korea100 process data survives Markdown save, revisions, reload and removal without losing prose', async () => {
    const disk = storage();
    const repo = createLocalWikiRepository('registry-process','편집자',disk);
    const original = '## 개요\n\n원본 설명입니다.\n\n## 참고\n\n[[관련 지식]]';
    const content = writeProcess(original, processFixture);
    assert.equal(withoutProcess(content), original);
    const first = await repo.save({...emptyWikiDraft('업무 절차'),content}, {expectedVersion:0});
    const loaded = (await createLocalWikiRepository('registry-process','편집자',disk).list())[0];
    assert.deepEqual(readProcess(loaded.content).process, parseProcess(processFixture));
    const removed = await repo.save({...first,content:writeProcess(first.content,null)}, {id:first.id,expectedVersion:1});
    assert.equal(removed.content, original);
    assert.equal(readProcess(removed.content).process, null);
    assert.deepEqual(readProcess((await repo.history(first.id))[1].content).process, parseProcess(processFixture));
  });
  await test('process adapter rejects duplicate IDs, orphan edges and unknown lane/stage/status instead of rendering fake valid structure', () => {
    assert.throws(()=>parseProcess({...processFixture,nodes:[processFixture.nodes[0],processFixture.nodes[0]]}),/중복/);
    assert.throws(()=>parseProcess({...processFixture,edges:[{...processFixture.edges[0],target:'missing'}]}),/존재하지 않는/);
    assert.throws(()=>parseProcess({...processFixture,nodes:[{...processFixture.nodes[0],lane:'없는 주체'}]}),/정의되지/);
    assert.throws(()=>parseProcess({...processFixture,nodes:[{...processFixture.nodes[0],status:'approved'}]}),/상태/);
    const invalid = writeProcess('원문',processFixture).replace('"target": "P02"','"target": "missing"');
    assert.equal(readProcess(invalid).process,null);
    assert.match(readProcess(invalid).error,/존재하지 않는/);
  });
  await test('registry counts real links once per neighbor and preserves review state, aliases, original excerpts and canvas content', () => {
    const base = {workspaceId:'a',version:1,createdAt:'2026-11-01',updatedAt:'2026-11-01',updatedBy:'관리자',aliases:[]};
    const a = {...emptyWikiDraft('자재 선정'),...base,id:'a',category:'자재',status:'review',content:'## 개요\n\n자재 선정의 근거.\n\n## 주요 내용\n\n[[기준]] [[기준|기준 원문]] [[없는 항목]] [[자재 선정]]',sources:[{id:'s',kind:'document',title:'시험 보고서',excerpt:'원본 인용'}]};
    const b = {...emptyWikiDraft('선정 기준'),...base,id:'b',category:'법규·기준',aliases:['기준'],content:'[[자재 선정]]'};
    const archived = {...emptyWikiDraft('보관 항목'),...base,id:'c',status:'archived'};
    const records=registryRecords([a,b,archived]);
    assert.equal(records.length,2);
    assert.deepEqual(records.map(r=>r.relationCount),[1,1]);
    assert.equal(records.find(r=>r.slug==='a').status,'review');
    assert.equal(records.find(r=>r.slug==='a').processNodeCount,0);
    assert.match(records.find(r=>r.slug==='a').searchText,/시험 보고서/);
    const connections=knowledgeConnectionModel(a,[a,b]);
    assert.equal(connections.nodes.length,2);
    assert.deepEqual(connections.edges.map(e=>[e.source,e.target]),[['a','b']]);
    assert.equal(documentSections(a)[0].content,'자재 선정의 근거.');
    assert.equal(documentSections({...a,content:'앞부분의 원본 요약.\n\n## 근거\n\n원본 인용.'})[0].content,'앞부분의 원본 요약.');
    assert.equal(a.sources[0].excerpt,'원본 인용');
  });

} finally { await server.close(); }
