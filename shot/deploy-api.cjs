const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = 'X-LSH/pixel-weather';
const ROOT = 'D:/Code/pixel-weather';

const run = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();

async function main() {
  const token = run('gh auth token');
  const api = async (p, method = 'GET', body) => {
    const res = await fetch(`https://api.github.com${p}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pixel-weather-deploy',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${JSON.stringify(j).slice(0, 240)}`);
    return j;
  };

  const remote = await api(`/repos/${REPO}/git/ref/heads/main`);
  const baseSha = remote.object.sha;
  console.log('remote base:', baseSha.slice(0, 7));

  const localHead = run('git rev-parse HEAD');
  if (localHead === baseSha) {
    console.log('already in sync');
    return;
  }

  // 本地历史里没有远端那个 API 生成的 commit，所以改动清单要用本地 HEAD~1 来算
  const localPrev = run('git rev-parse HEAD~1');
  const files = run(`git diff --name-only ${localPrev} ${localHead}`).split('\n').filter(Boolean);
  console.log('changed files:', files.length);

  const blobs = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(ROOT, f));
    const b = await api(`/repos/${REPO}/git/blobs`, 'POST', {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    blobs.push({ path: f, mode: '100644', type: 'blob', sha: b.sha });
    console.log('  blob', f);
  }

  const baseCommit = await api(`/repos/${REPO}/git/commits/${baseSha}`);
  const tree = await api(`/repos/${REPO}/git/trees`, 'POST', {
    base_tree: baseCommit.tree.sha,
    tree: blobs,
  });

  const message = run('git log -1 --pretty=%B');
  const commit = await api(`/repos/${REPO}/git/commits`, 'POST', {
    message,
    tree: tree.sha,
    parents: [baseSha],
  });

  await api(`/repos/${REPO}/git/refs/heads/main`, 'PATCH', { sha: commit.sha, force: false });
  console.log('PUSHED', commit.sha.slice(0, 7));
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
