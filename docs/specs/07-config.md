# Configuration file

_Implemented._

repo-dive runs with **zero configuration**. To refine its behavior, drop a
`repo-dive.config.ts` at the root of the **analyzed** repository (knip-style
— the config lives with the repo it describes, not with repo-dive). `.mjs`
and `.js` are also accepted; the first match in that order wins.

```ts
import { defineConfig } from "repo-dive/config";

export default defineConfig({
  contributors: {
    aliases: [
      // Shorthand: emails only, the first entry is canonical.
      ["alice@work.example", "alice@personal.example"],
      // Rich form: a display name, a profile link and an explicit kind.
      {
        emails: ["bob@work.example", "12345+bob@users.noreply.github.com"],
        displayName: "Bob",
        url: "https://github.com/bob",
        kind: "human",
      },
    ],
    // How many contributors charts keep before folding the rest into "Other".
    maxInCharts: 10,
  },
});
```

`defineConfig` is an identity helper exported from the `repo-dive/config`
entry point; it exists purely for type-checking and editor IntelliSense. A plain
default-exported object works too.

repo-dive derives its metrics from each commit's git **author** (not the
committer). "Contributor" is the people-level concept this config describes: one
person (or bot, or AI agent) who may commit under several author identities.

## Loading

The config is read by the **`index`** step (the map phase stays raw — the catalog
is never rewritten). `.ts` config relies on Node's built-in type stripping,
unflagged since Node 22.18 / 23.6; on older runtimes use a `.mjs`/`.js` config.
Malformed config fails `index` with a friendly message rather than silently
degrading.

## `contributors`

### `contributors.aliases`

People show up under multiple identities — work and personal email, GitHub
`noreply` addresses, name variants. A group is either a plain array of emails or
an object `{ emails, displayName?, url?, kind? }`; the **first email is
canonical** and the rest fold into it before the cube's dashboard data is built.
Merging applies to commit-count and churn attribution, the contributors table,
and code-survival-by-contributor. An email may appear in at most one group.

Emails are matched against each commit author's email in either its raw form or
its prettified GitHub-noreply handle — so listing `alice` matches
`12345+alice@users.noreply.github.com`, i.e. you can use the handle shown in the
report.

- `displayName` overrides the name shown in the per-contributor charts and the
  contributors table (the email column still shows the prettified canonical
  email).
- `url` makes that name a link (e.g. to a GitHub profile).
- `kind` is one of `"human"`, `"bot"` or `"ai"` (see below).

(Unifying AI assistant name variants through aliases is out of scope for now.)

### Contributor kinds

Every contributor has a **kind**: `human` (the default), `bot` (automation like
renovate, dependabot, github-actions) or `ai` (AI coding agents like Copilot,
Claude, Cursor, …). When a group omits `kind` — or for contributors with no
alias group at all — the kind is derived from the commit author's name and email;
anything unrecognized is a human. The dashboard badges bots (🤖) and AI agents
(✨) with an icon and lists them separately from human contributors.

### `contributors.maxInCharts`

How many contributors the per-contributor charts keep before folding the
remainder into an "Other" band. Defaults to `10`, must be an integer between 1
and 100. The stacked survival-by-contributor area keeps up to `maxInCharts`
series; the contributors bar list keeps twice that. The categorical palette
provides 20 distinct colors and cycles beyond that.
