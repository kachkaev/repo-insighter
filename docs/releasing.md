# Releasing

Releases follow the changesets flow copied from [kachkaev/s20-wifi-setup](https://github.com/kachkaev/s20-wifi-setup): merging to `main` never publishes directly. Instead, the release workflow keeps a "Version packages" PR up to date with pending changesets; merging that PR bumps the version, and the follow-up workflow run publishes to npm.

## One-time setup (manual steps)

npm treats a rename as a brand-new package, so the rename from `repo-insighter` to `repo-dive` in 0.4.0 meant running this list a second time. It is kept here in case it is ever needed again.

1.  **Initial publish** (npm requires the package to exist before a trusted publisher can be configured, so this one is done from a laptop). For the rename this was `0.4.0` — the version line continues rather than restarting, and the version + changelog entry are hand-written in the rename commit instead of going through a changeset:

```sh
npm login # as a maintainer of the package-to-be
pnpm build
npm publish --provenance=false # local publishes cannot generate provenance
```

1.  **Trusted publisher** — on npmjs.com → package `repo-dive` → Settings → Publishing access, add a GitHub Actions trusted publisher, mirroring s20-wifi-setup:

- Organization/user: `kachkaev`
- Repository: `repo-dive`
- Workflow: `release.yaml`
- Environment: `release`

1.  **GitHub environment** — repo Settings → Environments → create `release` (the workflow declares `environment: release`). Survives a repository rename.

1.  **Allow Actions to open PRs** — repo Settings → Actions → General → Workflow permissions → tick "Allow GitHub Actions to create and approve pull requests". Without it the changesets action cannot open the "Version packages" PR (this is exactly how the first Release runs failed). Survives a repository rename.

1.  **Point the old name at the new one** (rename only):

```sh
npm deprecate repo-insighter "Renamed to repo-dive — install repo-dive instead"
```

1.  **Test the pipeline**: once the steps above are done, the next changeset to land should produce a "Version packages" PR whose merge publishes via the trusted publisher, with no npm token anywhere.

## Provenance

`publishConfig.provenance` is set, so CI publishes attach a provenance attestation (the repository is public, which npm requires — provenance statements go to the public Sigstore transparency log and must point at a publicly verifiable source).

Two caveats:

- Local publishes cannot generate provenance (no CI OIDC identity), which is why the one-off initial publish above passes `--provenance=false`.
- If the repository is ever made private again, CI publishes will start failing until the `provenance` flag is removed.

## Day-to-day

- Every user-visible change lands with a changeset (`pnpm changeset`).
- CI (`ci.yaml`) runs the full check suite on every push/PR; `release.yaml` re-verifies build, lint and tests before versioning/publishing.
