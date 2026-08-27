# Deployment

What it costs to run this, which host was chosen and why, and the short list of things that cannot be
done from a keyboard here.

**Nothing in this file is deployed yet.** It exists so the pricing research is not done twice, and so
the work that *is* blocked is separated from the work that only looked blocked.

---

## The one thing that is actually blocked

Everything else in the deployment path is configuration and code. These are purchases:

| # | What to buy | Roughly | Needed for |
| --- | --- | --- | --- |
| 1 | **A domain** | $10–15/year | TLS on a real hostname, and — the reason it is not optional — SPF, DKIM and DMARC records. Mail from a domain without them is accepted by the provider and filed as spam by the recipient, which looks exactly like mail that never sent. |
| 2 | **A host** | $0–5/month | See the two options below. |
| 3 | **An SMTP account** | free | Volume here is a handful of password resets. Every provider's free tier covers it. |

That is the whole list. A domain is the only unavoidable cost.

---

## What it costs

Checked August 2026. Prices move; re-check before committing.

### Fly.io — **not free**

The free tier ended on 7 October 2024. New signups get a two-hour trial. The floor is the **Hobby
plan at $5/month**, which includes $5 of usage credit.

| Line | Cost |
| --- | --- |
| API machine (shared-cpu-1x, 256 MB, always on) | ~$1.94/mo |
| Web machine (static nginx, same size) | ~$1.94/mo |
| Compute total | ~$4/mo — inside the $5 credit |
| Postgres | extra on Fly; free on Neon (0.5 GB, 100 CU-hours/mo) |
| Redis | extra on Fly; free on Upstash (500 K commands/mo, 256 MB) |
| **Realistic total** | **~$5/month** |

Watch the Upstash ceiling if that route is taken: the Socket.io Redis adapter publishes on every
broadcast, so 500 K commands a month is roughly 16 K a day shared between rate limiting and every
message fan-out. Fine for a handful of users, not a number to forget about.

### A VPS — **free, and it uses what is already built**

Oracle Cloud Always Free is still free with no expiry, but was **halved on 15 June 2026** from 4
OCPU / 24 GB to **2 OCPU / 12 GB** on ARM. Still far more than this app needs.

The point in its favour is not the price. On a VPS, `docker-compose.prod.yml` — which already
declares two API instances, Postgres and Redis — runs as written, with Caddy in front for automatic
TLS. Nothing new to buy, nothing new to learn, and **the object-storage problem below disappears**.

The costs are real and are paid in attention: Postgres backups are yours to arrange and to *test*,
OS patching is yours, and Oracle's ARM capacity is genuinely hard to get in some regions — Singapore
in particular — with reports of idle instances being reclaimed.

### Truly $0, and what it costs you

A `*.fly.dev` hostname or a bare IP behind Cloudflare avoids the domain purchase. Mail is then
crippled: SPF/DKIM/DMARC need DNS records on a domain you control, so sending falls back to the
provider's sandbox domain, which usually only delivers to your own address. For an app whose
password-reset flow was just finished, that is a poor trade.

---

## Decision

**Not yet made.** The two candidates are above. What tips it:

- Want it live with the least fuss and $5/month is fine → **Fly.io**.
- Want $0 infrastructure and the most to learn → **Oracle VPS**, falling back to Fly if ARM capacity
  in Singapore is unavailable.

Record the choice here when it is made, with a line on why.

---

## Why the host choice changes the plan

### Uploaded files, and the shape of "two instances"

Avatars and attachments are written to a directory. `docker-compose.prod.yml` runs two API instances
sharing one volume, and that is the only reason it works.

- **On a VPS** both instances are on one machine and share the volume as written. Two instances work
  immediately, and object storage is a later nicety rather than a prerequisite.
- **On Fly** volumes attach to a single machine. Upload an avatar to machine A and machine B answers
  404 for it. Scaling past one machine therefore *requires* S3-compatible object storage first.

Nothing in the test suite can see either case: the suite runs one process. ADR 0004 anticipated the
swap — no row stores a file path, only `avatarUpdatedAt`, and the URL is derived — so it is a change
to two files rather than a migration.

### Socket.io across two instances

The Redis adapter shares rooms between processes. It does **not** provide session affinity, and
Socket.io opens with HTTP long-polling before upgrading, so a handshake split across two instances
fails. Either pin the client to the websocket transport or put affinity in the proxy. This is
host-independent and is handled in the codebase rather than in deployment config.

---

## Sources

Checked August 2026:

- [Fly.io pricing](https://costbench.com/software/cloud-infrastructure/fly-io/) ·
  [Fly.io free tier](https://www.saaspricepulse.com/blog/flyio-free-tier-2026)
- [Oracle free tier 2026 changes](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/) ·
  [Oracle Cloud Free Tier docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)
- [Neon free tier](https://agentdeals.dev/vendor/neon) ·
  [Upstash free tier](https://agentdeals.dev/vendor/upstash)
