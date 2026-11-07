import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { loadEnvironment } from '../server/wiki/env.mjs';
import { collectMarkdownArchive, assertReviewedArchive } from '../server/wiki/markdown-archive.mjs';

loadEnvironment();
const repo = 'leejinsoo1979/index-wiki';
const remote = `https://github.com/${repo}.git`;
const root = resolve(process.env.INDEX_KNOWLEDGE_DIR || '.index-knowledge');
const directory = join(root, 'github-markdown');
const reviewPath = join(root, 'github-backup-review.json');
const approvalPath = join(root, 'github-backup-approved.json');
const exec = promisify(execFile);
async function run(command, args, cwd = process.cwd()) {
  return (await exec(command, args, { cwd, timeout: 120000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim();
}
const git = (...args) => run('git', ['-c', 'core.hooksPath=/dev/null', ...args], directory);
async function privateRepository() {
  const data = JSON.parse(await run('gh', ['api', `repos/${repo}`, '--jq', '{name: .full_name, private: .private, push: .permissions.push}']));
  if (data.name !== repo || data.private !== true || data.push !== true) throw new Error('본인 소유의 비공개 위키 저장소인지 확인되지 않아 업로드를 중단했습니다.');
}
try {
  const plan = collectMarkdownArchive(root);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileSync(reviewPath, JSON.stringify({ digest: plan.digest, pages: plan.pageCount, revisions: plan.revisionCount, files: plan.entries }, null, 2) + '\n', { mode: 0o600 });
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({ reviewFile: reviewPath, pages: plan.pageCount, revisions: plan.revisionCount, blockedFiles: plan.entries.filter(file => file.warnings.length).length, reviewDigest: plan.digest }, null, 2));
  } else {
    const index = process.argv.indexOf('--approve-reviewed');
    const explicitApproval = index >= 0 ? process.argv[index + 1] : null;
    const savedApproval = existsSync(approvalPath) ? JSON.parse(readFileSync(approvalPath, 'utf8')).digest : null;
    assertReviewedArchive(plan, explicitApproval || savedApproval);
    await privateRepository();
    if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) throw new Error('심볼릭 링크 저장소에는 백업하지 않습니다.');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!existsSync(join(directory, '.git'))) {
      await git('init', '-b', 'main');
      await git('remote', 'add', 'origin', remote);
    }
    if ((await git('remote', 'get-url', 'origin')) !== remote) throw new Error('백업 대상 저장소가 승인된 주소와 다릅니다.');
    const allowed = path => path === 'README.md' || path === '.gitignore' || /^wiki\/[a-zA-Z0-9_-]+\.md$/.test(path) || /^revisions\/[a-zA-Z0-9_-]+\/[1-9]\d*\.md$/.test(path);
    const tracked = (await git('ls-files')).split('\n').filter(Boolean);
    if (tracked.some(path => !allowed(path))) throw new Error('허용하지 않은 파일이 백업 저장소에 있어 작업을 중단했습니다.');
    const readme = `# INDEX Wiki\n\n주거 실내건축 전문가 공동 지식의 비공개 Markdown 보관 저장소입니다.\n\n- 현재 위키 문서: ${plan.pageCount}개 (wiki/)\n- 버전별 본문: ${plan.revisionCount}개 (revisions/)\n- PDF·원본 파일·SQLite·활동 기록·사용자 정보·인증 정보는 포함하지 않습니다.\n- 문서의 검수 상태는 각 파일의 status를 확인하세요. review는 검수 전입니다.\n- 운영 원본 저장소와 별도로 보관하는 문서 사본이며, 전체 서버 복구용 백업은 아닙니다.\n\n## 백업 실행\n\nINDEX 프로젝트에서 Node 24와 GitHub CLI 인증 후 실행합니다.\n\n\`\`\`sh\nnpm run wiki:backup:github -- --plan\n# 새로 바뀐 문서와 편집 이력의 내용을 검토하고 개인정보가 없는지 확인합니다.\nnpm run wiki:backup:github -- --approve-reviewed <검토한 reviewDigest>\n# 문서 내용이 같으면 다음 명령만으로 재확인할 수 있습니다.\nnpm run wiki:backup:github\n\`\`\`\n\n변경된 내용은 새 검토 없이는 업로드하지 않으며, 매번 private 여부를 확인합니다.\n이름·주소 등 자동 탐지가 어려운 개인정보도 반드시 본문과 이전 버전을 함께 검토해야 합니다.\n`;
    const ignore = '*\n!.gitignore\n!README.md\n!wiki/\n!wiki/*.md\n!revisions/\n!revisions/*/\n!revisions/*/*.md\n';
    for (const file of [...plan.files, { path: 'README.md', content: readme }, { path: '.gitignore', content: ignore }]) {
      const path = join(directory, file.path);
      for (let parent = dirname(path); parent !== directory; parent = dirname(parent)) if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error('백업 경로에 심볼릭 링크가 있습니다.');
      if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('심볼릭 링크 파일은 백업하지 않습니다.');
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, file.content, { mode: 0o600 });
    }
    await git('add', '--', 'README.md', '.gitignore', ...plan.files.map(file => file.path));
    const staged = (await git('diff', '--cached', '--name-only')).split('\n').filter(Boolean);
    if (staged.some(path => !allowed(path))) throw new Error('승인되지 않은 종류의 파일이 스테이징되어 있습니다.');
    if (staged.length) await git('-c', 'user.name=INDEX Knowledge', '-c', 'user.email=index-knowledge@users.noreply.github.com', 'commit', '-m', 'Back up reviewed INDEX wiki Markdown and revision history');
    await privateRepository();
    await git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '--porcelain', 'origin', 'HEAD:main');
    const commit = await git('rev-parse', 'HEAD');
    const pushed = JSON.parse(await run('gh', ['api', `repos/${repo}/git/ref/heads/main`]));
    if (pushed.object?.sha !== commit) throw new Error('원격 커밋 확인이 일치하지 않습니다.');
    const inventory = JSON.parse(await run('gh', ['api', `repos/${repo}/git/trees/${commit}?recursive=1`]));
    const paths = inventory.tree.filter(item => item.type === 'blob').map(item => item.path);
    if (inventory.truncated || paths.some(path => !allowed(path))) throw new Error('원격 파일 목록에 허용되지 않은 파일이 있거나 전체 검증이 완료되지 않았습니다.');
    const expected = new Set([...plan.files.map(file => file.path), 'README.md', '.gitignore']);
    if ([...expected].some(path => !paths.includes(path))) throw new Error('원격 백업에 문서 파일이 누락되었습니다.');
    writeFileSync(approvalPath, JSON.stringify({ digest: plan.digest, commit, checkedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ repository: `https://github.com/${repo}`, visibility: 'private', pages: plan.pageCount, revisions: plan.revisionCount, remoteFiles: paths.length, commit, newCommit: staged.length > 0 }, null, 2));
  }
} catch (error) {
  // Never print subprocess arguments, environment values or credential helper output.
  console.error(error.code === 'ENOENT' ? 'Node 24, git, gh 설치와 데이터 경로를 확인해 주세요.' : error.stdout || error.stderr ? 'GitHub 백업 명령이 실패했습니다. gh 인증과 비공개 저장소 접근 권한을 확인해 주세요.' : error.message);
  process.exitCode = 1;
}
