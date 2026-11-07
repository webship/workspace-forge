/**
 * What a git forge is, to the dashboard.
 *
 * A forge hosts repositories, issues and pull (or merge) requests at one host, and the dashboard
 * authenticates there with a credential a person put in the forge plugin's settings. A provider
 * knows the host, how to read a remote URL, where the pages are, how to list the open issues and
 * requests, and which command opens a request from a branch. The row menu, the modals, the chip,
 * the clone option and the credential hook are the family's (registerForge).
 */

import type { PluginLib } from '@webship/workspace-plugin-api';

/** A repository on the forge, as read from a git remote. */
export interface ForgeRepo {
  /** 'owner/name' (or a deeper GitLab path). */
  path: string;
  /** The repository's web page. */
  web: string;
  /** The remote this was read from ('origin'). */
  remote: string;
}

export interface ForgeItem {
  number: number | string;
  title: string;
  url: string;
  author?: string;
  updated?: string;
  state?: string;
}

export interface ForgeProvider {
  /** The slot, the settings key and the route namespace: 'github'. */
  id: string;
  /** The button's text: 'GITHUB'. */
  label: string;
  /** The product's name in sentences: 'GitHub'. */
  title: string;
  /** The host this forge answers for, from the plugin's settings when it is configurable. */
  host: () => string;
  /** The CLI used when present (gh, glab); none for Bitbucket. */
  cli?: string;
  /** What the pull requests are called here: 'Pull requests' or 'Merge requests'. */
  pullsLabel: string;
  /** The environment a child process needs to authenticate at the host, or null when there is no credential. */
  env: () => NodeJS.ProcessEnv | null;
  /** Who the credential belongs to, for the settings page; never the token. */
  auth: () => { username?: string; email?: string; how: string };
  /** The repository a remote URL names, if it is on this host. */
  repoOf: (remoteUrl: string, remote: string) => ForgeRepo | null;
  /** The clone URL of 'owner/name' (or a full URL given as is). */
  cloneUrl: (spec: string) => string;
  /** The pages of a repository. */
  urls: (repo: ForgeRepo) => { issues: string; pulls: string; newIssue: string; newPull: (branch: string) => string };
  listIssues: (repo: ForgeRepo, lib: PluginLib, env: NodeJS.ProcessEnv) => Promise<ForgeItem[]>;
  listPulls: (repo: ForgeRepo, lib: PluginLib, env: NodeJS.ProcessEnv) => Promise<ForgeItem[]>;
  /** The command that opens a pull request from the branch, run in a terminal in the project; null when there is no CLI (the New-pull page is linked instead). */
  newPullCommand?: (repo: ForgeRepo, branch: string) => string;
  /** The environment a `git clone` of a private repository needs (a credential helper); merged into the clone step. */
  cloneEnv?: () => string;
  /** The pattern a clone spec must match, and its help. */
  clone: { pattern: RegExp; placeholder: string; help: string };
  /** Where the token comes from, for the message when there is none. */
  tokenHint: string;
}
