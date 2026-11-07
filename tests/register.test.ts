import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { registerForge, repoPathAt, gitRemotes, repoOnForge } from '../src/index';
import type { ForgeProvider } from '../src/index';

function fakeApi(root: string) {
  const calls: any = { rowMenus: {}, chips: [], actions: {}, setups: [], css: [], forges: {} };
  const api: any = {
    name: 'acme', config: {}, settings: { file: 'plugin.acme.settings.yml', read: () => ({}), set() {}, setList() {} },
    lib: {
      esc: (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)),
      ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (dir: string) => fs.readdirSync(dir),
      screenAction: (send: any, o: any) => { calls.screen = o; send('started'); }, iconHtml: (n: string) => `<i data-icon="${n}"></i>`, NAME_RE: /^[a-zA-Z0-9_-]+$/,
      run: async () => ({ ok: true, code: 0, stdout: '', stderr: '' }),
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addProjectChip: (fn: any) => calls.chips.push(fn), addAction: (name: string, fn: any) => { calls.actions[name] = fn; },
    addFolderSetup: (s: any) => calls.setups.push(s), addCss: (f: string) => calls.css.push(f),
    addForge: (host: string, spec: any) => { calls.forges[host] = spec; },
  };
  return { api, calls };
}

const forge = (withCli = true): ForgeProvider => ({
  id: 'acme', label: 'ACME', title: 'Acme Forge', host: () => 'acme.test', cli: withCli ? 'acme' : undefined, pullsLabel: 'Pull requests',
  env: () => ({ ...process.env, ACME_TOKEN: 't' }), auth: () => ({ username: 'me', how: 'token' }),
  repoOf: (url, remote) => { const p = repoPathAt('acme.test', url); return p ? { path: p, web: `https://acme.test/${p}`, remote } : null; },
  cloneUrl: (spec) => (/^https?:/.test(spec) ? spec : `https://acme.test/${spec}.git`),
  urls: (r) => ({ issues: `${r.web}/issues`, pulls: `${r.web}/pulls`, newIssue: `${r.web}/issues/new`, newPull: (b) => `${r.web}/compare/${b}` }),
  listIssues: async () => [{ number: 1, title: 'A bug', url: 'https://acme.test/o/r/issues/1', author: 'me' }],
  listPulls: async () => [],
  newPullCommand: withCli ? (r, b) => `acme pr create --repo ${r.path} --head ${b}` : undefined,
  clone: { pattern: /^[\w.-]+\/[\w.-]+$|^https?:\/\//, placeholder: 'owner/name', help: 'owner/name or a URL' },
  tokenHint: 'token in plugin.acme.settings.yml',
});

function tree(remote = 'git@acme.test:webship/site1.git') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-'));
  const p = path.join(root, 'dev', 'site1');
  fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n');
  fs.writeFileSync(path.join(p, '.git', 'config'), `[remote "origin"]\n\turl = ${remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
  return root;
}

test('remote URLs in every spelling resolve to owner/name at the host, and only at the host', () => {
  assert.strictEqual(repoPathAt('github.com', 'git@github.com:webship/workspace.git'), 'webship/workspace');
  assert.strictEqual(repoPathAt('github.com', 'https://github.com/webship/workspace'), 'webship/workspace');
  assert.strictEqual(repoPathAt('github.com', 'ssh://git@github.com/webship/workspace.git'), 'webship/workspace');
  assert.strictEqual(repoPathAt('git.drupalcode.org', 'https://git.drupalcode.org/project/webship.git'), 'project/webship');
  assert.strictEqual(repoPathAt('git.drupalcode.org', 'git@git.drupalcode.org:issue/webship-123.git'), 'issue/webship-123');
  assert.strictEqual(repoPathAt('github.com', 'https://gitlab.com/webship/workspace'), null);
  assert.strictEqual(repoPathAt('github.com', 'https://notgithub.com/a/b'), null);
});

test('the remotes of a folder are read from .git/config and the forge picks origin first', () => {
  const root = tree();
  const p = path.join(root, 'dev', 'site1');
  fs.appendFileSync(path.join(p, '.git', 'config'), '[remote "upstream"]\n\turl = https://acme.test/upstream/site1\n');
  assert.deepStrictEqual(Object.keys(gitRemotes(p)), ['origin', 'upstream']);
  assert.deepStrictEqual(repoOnForge(forge(), p), { path: 'webship/site1', web: 'https://acme.test/webship/site1', remote: 'origin' });
  assert.strictEqual(repoOnForge(forge(), path.join(root, 'dev')), null);
});

test('register() gives the forge its credential hook, menu, chip, actions, stylesheet and clone option', () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  registerForge(api, forge());
  assert.deepStrictEqual(Object.keys(calls.forges), ['acme.test']);
  assert.strictEqual(calls.forges['acme.test'].env().ACME_TOKEN, 't');
  assert.deepStrictEqual(calls.rowMenus.acme.spec, { label: 'ACME', row: 0 });
  assert.deepStrictEqual(Object.keys(calls.actions).sort(), ['issues', 'new-pull', 'pulls']);
  assert.ok(calls.css[0].endsWith('/css/forge.css') && fs.existsSync(calls.css[0]));
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => "hx-vals='{}'" };
  const html = calls.rowMenus.acme.fn(ctx);
  assert.match(html, /webship\/site1 · feature-x/);
  assert.match(html, /Open a pull request from feature-x/);
  assert.match(html, /Open the repository/);
  assert.match(html, /data-copy="https:\/\/acme\.test\/webship\/site1\.git"/);
  assert.match(calls.chips[0](ctx), /proj-acme-link/);
  fs.rmSync(path.join(root, 'dev', 'site1', '.git'), { recursive: true });
  assert.strictEqual(calls.rowMenus.acme.fn(ctx), null, 'no repository, no menu');
  assert.strictEqual(calls.chips[0](ctx), null);
});

test('a remote on another host gets nothing from this forge', () => {
  const root = tree('git@github.com:webship/site1.git');
  const { api, calls } = fakeApi(root);
  registerForge(api, forge());
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => '' };
  assert.strictEqual(calls.rowMenus.acme.fn(ctx), null);
});

test('the issues modal lists what the provider answers; the pull request opens in a terminal with the provider\'s command', async () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  registerForge(api, forge());
  let out = '';
  const send = (h: string) => { out = h; };
  await calls.actions.issues({ form: { projectName: 'site1' }, send, workspace: 'dev' });
  assert.match(out, /#1 A bug/);
  await calls.actions.pulls({ form: { projectName: 'site1' }, send, workspace: 'dev' });
  assert.match(out, /No open pull requests\./);
  await calls.actions['new-pull']({ form: { projectName: 'site1' }, send, workspace: 'dev' });
  assert.strictEqual(out, 'started');
  assert.strictEqual(calls.screen.cmdLine, 'acme pr create --repo webship/site1 --head feature-x');
  await calls.actions.issues({ form: { projectName: 'nope' }, send, workspace: 'dev' });
  assert.match(out, /Unknown project/);
});

test('without a CLI the menu links to the New-pull page instead of a terminal', () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  registerForge(api, forge(false));
  assert.deepStrictEqual(Object.keys(calls.actions).sort(), ['issues', 'pulls']);
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => '' };
  assert.match(calls.rowMenus.acme.fn(ctx), /href="https:\/\/acme\.test\/webship\/site1\/compare\/feature-x"/);
});

test('the New-folder option clones the named repository into the new folder, and refuses a bad spec', () => {
  const { api, calls } = fakeApi(tree());
  registerForge(api, forge());
  const [s] = calls.setups;
  assert.match(s.html('dev', {}), /name="acme" value="clone"/);
  assert.deepStrictEqual(s.steps('dev', 'n', { acme: 'clone', acme_repo: 'webship/site2' }), ["git clone 'https://acme.test/webship/site2.git' 'n'"]);
  assert.deepStrictEqual(s.steps('dev', 'n', { acme: 'none' }), []);
  assert.strictEqual(s.problem('dev', { acme: 'clone', acme_repo: 'bad spec' }), 'owner/name or a URL');
  assert.strictEqual(s.problem('dev', { acme: 'clone', acme_repo: 'webship/site2' }), '');
});
