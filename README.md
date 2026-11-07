# @webship/workspace-forge

The forge family's shared base for [Webship Workspace](https://github.com/webship/workspace)
plugins. A forge plugin (`@webship/workspace-github`, `-gitlab`, `-bitbucket`) is one call plus its
provider:

```ts
import { registerForge } from '@webship/workspace-forge';
export function register(api: PluginApi) { registerForge(api, provider(api)); }
```

`registerForge` registers the credential the dashboard uses for the host (`api.addForge`, which
`gh`-based work such as the AI-items sync picks up), draws the row menu on every project whose git
remote is at the host (open the repository, the open issues and pull or merge requests in the modal,
open a request from the current branch in a terminal, copy the clone URL), the repository chip on
the card, and the "Clone a repository into this folder" option of New folder. The `ForgeProvider`
says what differs between forges: the host, the CLI, how a remote URL reads, where the pages are,
how the open issues and requests are listed, the command that opens a request, the clone URL.
