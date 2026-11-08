/**
 * registerForge(api, forge): the whole surface of a forge plugin, from a provider's facts.
 *
 * The credential the dashboard uses for the host (api.addForge), the row menu on every project
 * whose git remote is at the host (repository, issues, pull requests, open one from the branch),
 * the repository chip on the card, the issues and requests modals, and the "Clone from <forge>"
 * option when a new folder is made. What differs between forges is in the provider.
 */

import fs from 'fs';
import path from 'path';
import type { ActionContext, Form, PluginApi, RowContext } from '@webship.co/workspace-plugin-api';

import type { ForgeItem, ForgeProvider, ForgeRepo } from './provider';

export * from './provider';

/** The remotes of a repository folder: name -> url. */
export function gitRemotes(projectDir: string): Record<string, string> {
  let cfg: string;
  try { cfg = fs.readFileSync(path.join(projectDir, '.git', 'config'), 'utf8'); } catch (_) { return {}; }
  const out: Record<string, string> = {};
  for (const m of cfg.matchAll(/\[remote "([^"]+)"\]([^[]*)/g)) {
    const url = (m[2].match(/url\s*=\s*(\S+)/) || [])[1];
    if (url) out[m[1]] = url;
  }
  return out;
}

export function gitBranch(projectDir: string): string | null {
  try {
    const head = fs.readFileSync(path.join(projectDir, '.git', 'HEAD'), 'utf8').trim();
    return (head.match(/^ref: refs\/heads\/(.+)$/) || [])[1] || null;
  } catch (_) { return null; }
}

/** The repository of the folder on this forge: origin first, then any remote. */
export function repoOnForge(forge: ForgeProvider, projectDir: string): ForgeRepo | null {
  const remotes = gitRemotes(projectDir);
  const names = ['origin', ...Object.keys(remotes).filter((n) => n !== 'origin')];
  for (const name of names) {
    if (!remotes[name]) continue;
    const r = forge.repoOf(remotes[name], name);
    if (r) return r;
  }
  return null;
}

/** 'owner/name' from a remote URL at `host`, in the ssh, https and ssh:// spellings; null otherwise. */
export function repoPathAt(host: string, url: string): string | null {
  const h = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = url.match(new RegExp(`^(?:https?://(?:[^@/]+@)?${h}/|(?:ssh://)?(?:git@)?${h}[:/])(.+?)(?:\\.git)?/?$`, 'i'));
  return m ? m[1] : null;
}

export function registerForge(api: PluginApi, f: ForgeProvider): void {
  const { esc, workspaceDir, listProjects, screenAction, iconHtml, NAME_RE } = api.lib;
  const post = (name: string) => `/actions/p/${api.name}/${name}`;
  const shq = (v: unknown) => `'${String(v).replace(/'/g, `'\\''`)}'`;

  if (typeof (api as any).addForge === 'function') (api as any).addForge(f.host(), { label: f.title, env: f.env, auth: f.auth });
  if (typeof api.addCss === 'function') api.addCss(path.join(__dirname, '..', '..', 'css', 'forge.css'));

  // ---- The menu on a project row ---------------------------------------------------------------

  api.addRowMenu(f.id, { label: f.label, row: 0 }, ({ key, project, dir, vals }: RowContext) => {
    const pdir = path.join(dir, project);
    if (!fs.existsSync(path.join(pdir, '.git'))) return null;
    const repo = repoOnForge(f, pdir);
    if (!repo) return null;
    const branch = gitBranch(pdir);
    const u = f.urls(repo);
    const caption = repo.remote === 'origin' ? 'origin' : repo.remote;
    const modal = (name: string) => `hx-post="${post(name)}" hx-vals='{"workspace":"${esc(key)}","projectName":"${esc(project)}"}' hx-target="#editor-modal-body" hx-swap="innerHTML"`;
    return `<span class="act-with-status"><div class="uk-inline act-menu act-menu-${esc(f.id)} act-menu-forge">
        <button class="uk-button uk-button-default uk-button-small" type="button" title="${esc(repo.path)} on ${esc(f.title)}"><span uk-icon="icon: git-fork; ratio: .7"></span> ${esc(f.label)} <span uk-icon="icon: chevron-down; ratio: .6"></span></button>
        <div uk-dropdown="mode: click; pos: bottom-right"><ul class="uk-nav uk-dropdown-nav">
          <li class="uk-nav-header forge-menu-repo" data-group="repository">${esc(repo.path)}${branch ? ` · ${esc(branch)}` : ''}</li>
          <li><a href="${esc(repo.web)}" target="_blank" rel="noopener"><span uk-icon="icon: link-external; ratio: .7"></span> Open the repository</a></li>
          <li><a href ${modal('issues')}><span uk-icon="icon: warning; ratio: .7"></span> Open issues</a></li>
          <li><a href ${modal('pulls')}><span uk-icon="icon: git-branch; ratio: .7"></span> Open ${esc(f.pullsLabel.toLowerCase())}</a></li>
          <li class="uk-nav-divider"></li>
          ${branch && f.newPullCommand
    ? `<li><a href hx-post="${post('new-pull')}" ${vals()}><span uk-icon="icon: push; ratio: .7"></span> Open a ${esc(f.pullsLabel.toLowerCase().replace(/s$/, ''))} from ${esc(branch)}…</a></li>`
    : `<li><a href="${esc(u.newPull(branch || ''))}" target="_blank" rel="noopener"><span uk-icon="icon: push; ratio: .7"></span> New ${esc(f.pullsLabel.toLowerCase().replace(/s$/, ''))}${branch ? ` from ${esc(branch)}` : ''}</a></li>`}
          <li><a href="${esc(u.newIssue)}" target="_blank" rel="noopener"><span uk-icon="icon: plus-circle; ratio: .7"></span> New issue</a></li>
          <li><a href="#" class="copy-cmd" data-copy="${esc(f.cloneUrl(repo.path))}" title="Copy the clone URL"><span uk-icon="icon: copy; ratio: .7"></span> Copy the clone URL</a></li>
        </ul></div>
      </div><span class="act-status uk-text-meta">${esc(caption)}</span></span>`;
  });

  // ---- The repository chip on the card ---------------------------------------------------------

  api.addProjectChip(({ project, dir }) => {
    const repo = repoOnForge(f, path.join(dir, project));
    if (!repo) return null;
    return `<a class="proj-alias proj-plugin-link proj-forge-link proj-${esc(f.id)}-link" href="${esc(repo.web)}" target="_blank" rel="noopener"
      title="${esc(repo.path)} on ${esc(f.title)}">${iconHtml('tabler:git-fork', 0.7)}<span class="pcard-chip-text">${esc(repo.path)}</span></a>`;
  });

  // ---- Issues and requests, listed in the modal -------------------------------------------------

  const guard = ({ form, send, workspace }: ActionContext) => {
    const dir = workspaceDir(workspace);
    const project = String(form.projectName || '');
    if (!NAME_RE.test(project) || !listProjects(dir).includes(project)) { send('<div class="msg error">Unknown project.</div>', 400); return null; }
    const repo = repoOnForge(f, path.join(dir, project));
    if (!repo) { send(`<div class="msg error">This project has no git remote on ${esc(f.title)}.</div>`, 409); return null; }
    return { dir, project, repo };
  };

  const itemsHtml = (items: ForgeItem[], empty: string) => (items.length
    ? `<ul class="uk-list uk-list-divider forge-items">${items.map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">#${esc(i.number)} ${esc(i.title)}</a>${i.author ? `<span class="uk-text-meta">${esc(i.author)}</span>` : ''}${i.updated ? `<span class="uk-text-meta">${esc(String(i.updated).slice(0, 10))}</span>` : ''}</li>`).join('')}</ul>`
    : `<p class="uk-text-meta">${esc(empty)}</p>`);

  for (const [name, title, list, pageOf] of [
    ['issues', 'Open issues', (r: ForgeRepo, env: NodeJS.ProcessEnv) => f.listIssues(r, api.lib, env), (r: ForgeRepo) => f.urls(r).issues],
    ['pulls', `Open ${f.pullsLabel.toLowerCase()}`, (r: ForgeRepo, env: NodeJS.ProcessEnv) => f.listPulls(r, api.lib, env), (r: ForgeRepo) => f.urls(r).pulls],
  ] as const) {
    api.addAction(name, async (ctx: ActionContext) => {
      const g = guard(ctx); if (!g) return;
      const env = f.env() || process.env;
      let items: ForgeItem[] = []; let problem = '';
      try { items = await list(g.repo, env); } catch (e) { problem = String((e as Error).message || e); }
      return ctx.send(`
        <div class="editor-card">
          <h3 class="uk-margin-small-bottom">${esc(title)} — ${esc(g.repo.path)}</h3>
          <p class="uk-text-meta">On ${esc(f.title)}. <a href="${esc(pageOf(g.repo))}" target="_blank" rel="noopener">All of them</a>${!f.env() ? ` · no credential (${esc(f.tokenHint)}): a private repository answers nothing` : ''}</p>
          ${problem ? `<div class="msg error"><pre>${esc(problem)}</pre></div>` : itemsHtml(items, `No ${title.toLowerCase()}.`)}
        </div>`);
    });
  }

  // ---- A pull request from the current branch, in a terminal -------------------------------------

  if (f.newPullCommand) {
    const cmd = f.newPullCommand;
    api.addAction('new-pull', (ctx: ActionContext) => {
      const g = guard(ctx); if (!g) return;
      const branch = gitBranch(path.join(g.dir, g.project));
      if (!branch) return ctx.send('<div class="msg error">The project is on a detached HEAD: check out a branch first.</div>', 409);
      return screenAction(ctx.send, { workspace: ctx.workspace, project: g.project, projectDir: path.join(g.dir, g.project),
        ownerDir: path.join(g.dir, g.project), verb: `${f.id}-pull-${branch.replace(/[^a-zA-Z0-9_-]+/g, '-')}`,
        cmdLine: cmd(g.repo, branch), label: `${f.id}: ${f.pullsLabel.toLowerCase().replace(/s$/, '')} from ${branch}` });
    });
  }

  // ---- New folder: clone from the forge ---------------------------------------------------------

  api.addFolderSetup({
    html: (ws: string) => `<div class="uk-margin-small-top folder-forge folder-${esc(f.id)}">
        <span class="uk-text-meta">${esc(f.title)}:</span>
        <label class="uk-margin-small-right"><input class="uk-radio" type="radio" name="${esc(f.id)}" value="none" checked> Not now</label>
        <label><input class="uk-radio" type="radio" name="${esc(f.id)}" value="clone"> Clone a repository into this folder</label>
        <div class="folder-forge-repo uk-margin-small-top">
          <label class="uk-form-label" for="folder-${esc(f.id)}-repo">Repository (owner/name, or its URL)</label>
          <input class="uk-input uk-form-small uk-form-width-large" id="folder-${esc(f.id)}-repo" name="${esc(f.id)}_repo" placeholder="${esc(f.clone.placeholder)}">
          <span class="uk-text-meta">${esc(ws)} gets a clone; the folder must be new.</span>
        </div>
      </div>`,
    steps: (_ws: string, name: string, form: Form) => {
      if (form[f.id] !== 'clone') return [];
      const spec = String(form[`${f.id}_repo`] || '').trim();
      const env = f.cloneEnv ? `${f.cloneEnv()} ` : '';
      // git clones into an existing EMPTY folder, which is what the setup made.
      return [`${env}git clone ${shq(f.cloneUrl(spec))} ${shq(name)}`];
    },
    prompt: () => [],
    problem: (_ws: string, form: Form) => {
      if (form[f.id] !== 'clone') return '';
      const spec = String(form[`${f.id}_repo`] || '').trim();
      return f.clone.pattern.test(spec) ? '' : f.clone.help;
    },
  } as any);
}
