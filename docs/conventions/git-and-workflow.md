# Git and workflow conventions

Rules for how work enters the repository. These matter more, not less, as the project grows — a history you can read is how you answer "why is this line here?" two years later.

---

## Commit messages — Conventional Commits

```
<type>(<scope>): <subject>

<optional body: why, not what>
```

**Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`.

**Scope** is the workspace or module: `server`, `web`, `auth`, `messages`, `shared-types`, `deps`.

```
feat(auth): add password reset flow
fix(messages): reject sends from non-participants
refactor(web): extract message list into its own component
docs(conventions): document the socket room strategy
```

Rules:

- Subject in the imperative, lowercase, no trailing period: "add", not "added" or "Adds".
- **The body explains *why*.** The diff already shows what changed; what it cannot show is the reasoning, the alternative you rejected, or the bug that prompted it.
- One logical change per commit. A commit that touches auth, restyles a button, and bumps a dependency is a commit that cannot be reverted.

---

## Branches

```
<type>/<short-description>
```

`feat/group-chat`, `fix/socket-reconnect`, `refactor/message-service`.

- Branch off `main`. Keep branches short-lived — a branch alive for two weeks is a merge conflict you have not met yet.
- Never commit directly to `main` once anyone else is involved.

---

## Before you open a PR

```bash
npm run typecheck        # all workspaces
npm run lint
npm run test
bash scripts/audit-rules.sh apps/web/src   # frontend only
```

All four clean. "It works on my machine" is not a state that survives a second machine.

Checklist:

- [ ] `typecheck`, `lint`, `test` pass
- [ ] New env vars added to `.env.example` in the same commit
- [ ] Schema change has a migration committed alongside it
- [ ] No `console.log`, no commented-out code, no `any`
- [ ] Types crossing the wire live in `packages/shared-types`, not duplicated
- [ ] A decision that shapes future work is written down — a comment for a local one, an ADR under `docs/adr/` for an architectural one

---

## Architecture Decision Records

Any decision that is **expensive to reverse** gets an ADR in `docs/adr/`, numbered, using the shape of [`0001-tech-stack.md`](../adr/0001-tech-stack.md): Status, Context, Decision, Consequences.

Write one for: swapping a core library, changing the auth model, splitting a service out, choosing a deployment target. Do not write one for: adding a component, fixing a bug, renaming a file.

The value is in the **Consequences** section — the trade-offs you knowingly accepted. That is the part nobody remembers a year later, and it is the part that tells the next person whether the decision still holds.

---

## What the AI agent may and may not do

Declared here because chatty is built with an agent in the loop, and these are the boundaries:

- **Never commit or push unprompted.** Wait for an explicit "commit this" / "push it" in the same turn.
- Never `git checkout` / `reset` / `clean` over uncommitted work without checking `git status` and stashing first.
- Running `typecheck` / `lint` / `test` unprompted: **yes** — they are cheap and catch real breakage before it is handed over.
- Report failures honestly, with the output. A test that fails is reported as failing, not narrated as "should work".
