# auth feature

Create subfolders only when there is something to put in them — empty scaffolding is noise.
The full shape a feature may grow into (`pages/`, `components/`, `hooks/`, `utils/`, `constants/`,
`types/`) is documented in [docs/conventions/frontend.md](../../../../../docs/conventions/frontend.md).

## To build

- `pages/login-page.tsx` — route-level component, rendered by `app.tsx` at `/login`
- `components/login-form.tsx` — email + password fields, posts to `/auth/login` via `@/api/client`,
  stores the returned token, navigates to `/chat`
- `components/register-form.tsx` — same shape against `/auth/register`
- `hooks/use-auth.ts` — holds `{ user, token }` and exposes `login` / `logout`, so other features
  read auth state without prop-drilling

## Reminders

- Never import from `@/features/chat`. Anything both features need goes to `@/components`, `@/hooks`,
  or `@/utils`.
- Types the server also knows about (`UserDTO`) come from `@chatty/shared-types`, not redeclared here.
