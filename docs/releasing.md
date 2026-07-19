# Releasing

Releases follow the changesets flow copied from [kachkaev/s20-wifi-setup](https://github.com/kachkaev/s20-wifi-setup): merging to `main` never publishes directly. Instead, the release workflow keeps a "Version packages" PR up to date with pending changesets; merging that PR bumps the version, and the follow-up workflow run publishes to npm.

## One-time setup (manual steps)

1.  **Initial publish of `0.0.0`** (npm requires the package to exist before a trusted publisher can be configured, so this one is done from a laptop):

```sh
npm login    # as a maintainer of the package-to-be
pnpm publish # prepack builds dist/; publishes repo-insighter@0.0.0
```

1.  **Trusted publisher** — on npmjs.com → package `repo-insighter` → Settings → Publishing access, add a GitHub Actions trusted publisher, mirroring s20-wifi-setup:

- Organization/user: `kachkaev`
- Repository: `repo-insighter`
- Workflow: `release.yaml`
- Environment: `release`

1.  **GitHub environment** — repo Settings → Environments → create `release` (the workflow declares `environment: release`).

1.  **Test the pipeline**: a changeset for `0.0.1` is already committed. Once steps 1–3 are done, merge the "Version packages" PR that the release workflow opens; the subsequent run on `main` should publish `0.0.1` via the trusted publisher, with no npm token anywhere.

## Provenance

npm **cannot publish with provenance while the repository is private**: provenance statements go to the public Sigstore transparency log and must point at a publicly verifiable source repo (they would also leak the repo's existence). Local `npm publish` cannot generate provenance either — it requires a supported CI's OIDC identity.

Because of that, `publishConfig.provenance` is currently **not** set. When the repository goes public:

1.  Re-add `"provenance": true` to `publishConfig` in `package.json` (or rely on npm's automatic provenance for trusted-publisher publishes from public repos, if the npm CLI on the runner is new enough — explicit config is the safer bet).
1.  The next CI publish gets a provenance badge on npmjs.com; nothing else changes.

## Day-to-day

- Every user-visible change lands with a changeset (`pnpm changeset`).
- CI (`ci.yaml`) runs the full check suite on every push/PR; `release.yaml` re-verifies build, lint and tests before versioning/publishing.
