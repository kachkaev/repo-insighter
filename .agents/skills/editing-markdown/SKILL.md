---
name: editing-markdown
description: "Conventions for authoring Markdown in this repo: one sentence per line (no hard-wrapping), and ordered lists with a two-space marker so content starts at column 4. Use whenever you create OR edit ANY Markdown (.md) file — skill files, changesets, specs, docs, READMEs — no matter how small the change: even a one-line edit or a single fixed sentence counts."
---

# Editing Markdown

Conventions for every authored `.md` file in this repo — the skills under [`.agents/skills`](..), the [`docs`](../../../docs) tree, changesets in [`.changeset`](../../../.changeset), and [`README.md`](../../../README.md).

Two tools guard these, and they split the work:

- **Prettier** ([`@kachkaev/prettier-config`](../../../package.json)) leaves `proseWrap` at its default (`preserve`), so it _preserves_ one sentence per line — it never adds the breaks, so author them by hand.
- **markdownlint** ([`@kachkaev/markdownlint-config`](../../../.markdownlint.json)) _enforces_ the ordered-list shape below (`MD029`, `MD030`), so `pnpm lint` fails if you get it wrong.

Don't touch generated or vendored Markdown: [`CHANGELOG.md`](../../../CHANGELOG.md) is produced by Changesets (see [`pr-authoring`](../pr-authoring/SKILL.md)) and [`LICENSE.md`](../../../LICENSE.md) is standard license text — leave both as they are.

## One sentence per line

Write each sentence of a paragraph on its own line.
Do not hard-wrap inside a sentence, and do not put two sentences of the same paragraph on one line.
Long lines are fine: the break is semantic (one per sentence), not visual (one per column).

This keeps diffs small — editing a sentence touches exactly one line — and makes review and `git blame` precise.
Rendered Markdown collapses consecutive lines into one paragraph, so the output is unchanged; start a new paragraph with a blank line as usual.

Prettier's `proseWrap` is left at `preserve`, so it leaves these line breaks alone, and markdownlint's `MD013` (line-length) is off, so long lines never trip the linter.

## Ordered lists: two-space marker, all `1.`

Write every ordered-list marker as `1.` followed by **two spaces**, so item content starts at column 4:

```md
1.  First step.
    A follow-up sentence about the first step, indented four spaces.
1.  Second step, with nested content — also four spaces:
    - a nested bullet
    - another nested bullet
```

Two things markdownlint enforces here, so both are non-negotiable rather than stylistic:

- **Every marker is `1.`, not `1.` / `2.` / `3.`** — `MD029` is set to `style: "one"`. The numbers render as `1. 2. 3.` regardless; using `1.` for each means inserting or reordering a step never changes the numbers on the lines below it, so the diff stays minimal. (Prettier keeps whatever you write, so it won't count them up into `1.` / `2.` / `3.`.)
- **Two spaces after the dot** — `MD030` is set to `ol_single`/`ol_multi: 2`, landing item content at column 4.

Everything that belongs to an item — continuation sentences, nested lists, fenced code blocks — indents by four spaces.
Four spaces (rather than the three a single-space `1.` marker gives) keeps nested code fences and sub-lists unambiguous and lands on a normal tab stop.

Unordered lists keep their natural two-space indent: `-` then a space, with continuations aligned two spaces in.

Keep each list item on its own line — a short item may run to a second sentence without breaking, since the one-sentence-per-line rule governs paragraph prose.
When an item grows into real paragraphs, split those the same way, indented to stay under the item.

## Check your work

Run the same linters CI does before you consider a Markdown change done:

```sh
pnpm lint:markdownlint
pnpm lint:prettier
```

`pnpm fix:markdownlint` and `pnpm fix:prettier` auto-fix what they can, but neither breaks prose into one sentence per line — that stays a manual edit.
