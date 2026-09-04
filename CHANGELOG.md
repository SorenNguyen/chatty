# Changelog

All notable release-level changes are recorded here. The detailed implementation history and trade-offs
remain in [the roadmap](docs/ROADMAP.md) and [architecture decisions](docs/adr/).

This project follows [Semantic Versioning](https://semver.org/) and the repository's
[release conventions](docs/conventions/releases.md).

## [0.2.0-rc.1] — 2026-09-05

### Added

- Durable IndexedDB conversation snapshots and an idempotent offline message outbox.
- Owner/admin/member group controls and owner-selectable invitation policy.
- Bandwidth-aware image uploads, thread thumbnails and compressed HTTP responses.
- Protected Prometheus-compatible metrics for HTTP, messages, images, database queries and sockets.
- A two-instance zero-cost deployment topology, Cloudflare Tunnel option, encrypted backup/restore
  tooling and realistic long mixed-media demo data.

### Changed

- Local verification now follows changed files while release/CI gates retain complete coverage.
- CI runs static analysis, server test shards, web tests and cached container builds in parallel.
- Production media policy, logging rotation, health checks and dependency-layer caching are hardened.

### Fixed

- Replayed message sends converge on one durable row instead of producing duplicates.
- Group roles remain impossible in direct conversations at the database boundary.
- Production audio is permitted by the web Content Security Policy.

[0.2.0-rc.1]: https://github.com/ntm204/chatty/releases/tag/v0.2.0-rc.1
