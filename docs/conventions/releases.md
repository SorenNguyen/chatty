# Release conventions

Chatty uses [Semantic Versioning](https://semver.org/) before and after `1.0.0`, with every workspace
released in lockstep. The root package, server, web, shared types and lockfile always carry the same
version; `npm run version:check` enforces that invariant.

## Version meaning

- `0.Y.0` — a pre-1.0 product capability, protocol/schema change, or meaningful deployment change.
- `0.Y.Z` — a compatible fix, refactor, documentation correction or operational hardening.
- `X.Y.Z-rc.N` — a release candidate. It is feature-complete for that version but still awaiting
  acceptance or external launch conditions.
- `1.0.0` — the first supported public production release, after domain/TLS, production mail and
  off-host recovery are proven on the deployed host.

Git tags are annotated and add a `v`: package `0.2.0-rc.1` is tag `v0.2.0-rc.1`. Tags never move or
get reused. A correction after publishing increments the patch or prerelease number.

## Release gate

1. Start from `main` with no unrelated local files staged.
2. Update every package version, `package-lock.json`, `CHANGELOG.md` and relevant product status text.
3. Run `npm run verify:full`, `npm run test:e2e`, both production image builds and the production
   smoke/health check.
4. Commit as `chore(release): vX.Y.Z`, create the annotated tag, then push the commit and tag.
5. Watch both GitHub workflows. A normal push runs the complete parallel unit/static/image gate. A
   version tag additionally reruns that gate and browser E2E before publishing version-addressed multi-arch
   images and a GitHub Release.

Release images are `ghcr.io/ntm204/chatty-server:vX.Y.Z` and
`ghcr.io/ntm204/chatty-web:vX.Y.Z`. Release-candidate web images default to the same-machine
`http://localhost:4000` API used for private acceptance. Before a public version tag, set the GitHub
repository variable `CHATTY_PUBLIC_API_URL` to the verified HTTPS API origin; Vite bakes that value
into the static bundle. Deployment remains a deliberate operator action: publishing an artifact must
never silently replace live user data or run migrations against an unknown host.
