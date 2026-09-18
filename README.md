# JobLog

[![CI](https://github.com/amromar093-cmyk/joblog/actions/workflows/ci.yml/badge.svg)](https://github.com/amromar093-cmyk/joblog/actions/workflows/ci.yml)

A job-application tracker API — built to actually manage my own job search,
and to prove I can design a backend from nothing: no Supabase, no Firebase,
just Express, Postgres, and my own auth.

Track every application (company, role, status), and every application keeps
its own timeline — a status change logs itself automatically, and you can
drop in a manual follow-up note ("recruiter called," "sent a nudge email").

It also scores how well your resume actually fits a posting, and drafts a
cover letter with a real tool-calling agent that can only cite evidence it
retrieved from your resume — see [AI: job matching & cover letters](#ai-job-matching--cover-letters).

## Why this exists

My other project ([Bayt](https://github.com/amromar093-cmyk/bayt-expenses))
proves I can ship a real React Native app with a real backend — but that
backend is Supabase, which hands you auth and row-level security for free.
This one has none of that: the auth, the ownership checks, the API design,
the error handling are all mine, on a database I designed myself.

## Stack

- **Express 5** + **TypeScript**, plain (no framework magic beyond Express itself)
- **PostgreSQL** via **Prisma** (schema, generated types, query builder)
- **JWT** auth with **bcrypt** password hashing — no third-party auth provider
- **Zod** for request validation
- **Anthropic Claude** (`claude-sonnet-5`) for structured skill extraction and
  a tool-calling cover-letter agent — see below
- **Voyage AI** for embeddings (Anthropic's recommended embeddings partner;
  Claude itself has no embeddings endpoint)
- **Jest** + **Supertest** — unit tests need nothing running; the integration
  suite hits real routes against a real Postgres

## Run it locally

```bash
npm install
cp .env.example .env          # then set a real JWT_SECRET
docker compose up -d          # starts Postgres on :5432
npm run db:push               # creates the tables from prisma/schema.prisma
npm run dev                   # API on http://localhost:4000
```

No Docker? Point `DATABASE_URL` in `.env` at any Postgres 14+ instance
(Neon and Render both have a free tier) and skip the `docker compose` step.

The AI routes need two more keys in `.env` — the app runs fine without them,
those specific routes just 503 with a clear message until they're set:

```bash
ANTHROPIC_API_KEY="sk-ant-..."   # console.anthropic.com
VOYAGE_API_KEY="pa-..."          # dash.voyageai.com — free tier is plenty for this
```

## API

All routes are prefixed `/api`. Authenticated routes take
`Authorization: Bearer <token>`.

| Method | Path                        | Auth | Does |
|---|---|---|---|
| POST   | `/auth/register`           |      | Create an account, returns a token |
| POST   | `/auth/login`               |      | Returns a token |
| GET    | `/auth/me`                   | ✓    | The signed-in user |
| GET    | `/applications`             | ✓    | List your applications (`?status=` to filter) |
| POST   | `/applications`             | ✓    | Create one |
| GET    | `/applications/:id`         | ✓    | One application + its timeline |
| PATCH  | `/applications/:id`         | ✓    | Update it — a status change auto-logs a timeline event |
| DELETE | `/applications/:id`         | ✓    | Delete it (and its timeline, cascade) |
| POST   | `/applications/:id/events`  | ✓    | Add a manual follow-up note |
| GET    | `/resume/bullets`           | ✓    | List your resume bullets |
| POST   | `/resume/bullets`           | ✓    | Add one (embedded server-side on write) |
| DELETE | `/resume/bullets/:id`       | ✓    | Delete one |
| POST   | `/applications/:id/match`   | ✓    | Score fit against a pasted job description |
| POST   | `/applications/:id/cover-letter` | ✓ | Draft a cover letter, citing real resume bullets |

Status is one of `WISHLIST · APPLIED · INTERVIEWING · OFFER · REJECTED · WITHDRAWN`.

Every `:id` route 404s (not 403) for an application that belongs to someone
else — indistinguishable from it not existing at all, so ids can't be probed.

## AI: job matching & cover letters

**Fit scoring** (`POST /applications/:id/match`) — paste a job description
in, and Claude extracts the concrete required/preferred skills as structured
output (a forced tool call, so the response literally cannot be malformed
JSON — no prose parsing). Each extracted skill and each of your resume
bullets gets embedded once (Voyage), and skills are matched to bullets by
cosine similarity, not keyword overlap — "designed HTTP APIs" matches a
posting that asks for "REST API experience" even though no word is shared.
The result (score, matched skills, missing skills) is saved on the
application.

**Cover-letter drafting** (`POST /applications/:id/cover-letter`) is a real
tool-calling agent, not a single prompt-and-done call: Claude gets a
`search_resume_bullets` tool and decides for itself what to look for —
usually several searches, one per thing the role asks for — before calling
`submit_cover_letter`. It never sees your whole resume dumped into the
prompt; it only sees what it actually searched for. The system prompt
forbids claiming anything not backed by a retrieved bullet, and every
citation it self-reports is checked server-side against real bullet ids
before being saved — the model's citation list is treated as a claim to
verify, not a guarantee.

**`npm run eval`** is the part most AI features skip: a small set of
hand-written golden fixtures (`src/eval/fixtures.ts`) that hit the real
Claude + Voyage APIs and check the actual behavior — does matching correctly
avoid claiming a React Native job is a fit for a backend-only resume, and
does a second, independent Claude call (LLM-as-judge) agree every claim in a
drafted letter traces back to real, cited experience. It needs
`ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` set and costs a few cents to run, which
is exactly why it's a manual script and not a CI step — see
[Design notes](#design-notes--trade-offs).

## Testing

```bash
npm test               # unit — no DB needed: hashing, JWTs, validation, matching math
npm run test:integration  # real routes against real Postgres — needs DATABASE_URL
npm run eval            # real Claude + Voyage calls against golden fixtures — needs API keys, costs a few cents
```

`.github/workflows/ci.yml` runs the first two, with a throwaway Postgres
service container for the integration suite — every push is verified
against a real database, not a mock. The AI routes are exercised in the
integration suite too, but with `src/ai/*` mocked: that suite is proving the
routes persist and authorize correctly, not re-proving the model behaves —
that's what `npm run eval` is for, deliberately kept out of CI (see below).

## Design notes / trade-offs

- **Ownership is checked by querying `WHERE id = ? AND userId = ?` together**,
  not by fetching the row and then comparing — so a not-found and a
  not-yours are the exact same code path and the exact same response.
- **A status change writes its own `ApplicationEvent`** inside the same
  `$transaction` as the update, so the timeline can never drift out of sync
  with the application it describes.
- **Schema sync is `prisma db push`, not `prisma migrate dev`** — right for
  a solo project at this stage; migration history (via `migrate dev`) is the
  obvious next step before this ever ran alongside real user data.
- **No refresh tokens** — a 7-day JWT is enough for a personal tool; a
  refresh-token rotation would be the next thing to add for anything
  public-facing.
- **Embeddings are a plain Postgres `Float[]` column, not pgvector.** Cosine
  similarity over a dozen resume bullets per request is trivial in JS, and
  this keeps the schema runnable on any stock Postgres — including CI's
  ephemeral container — with no extension to install. pgvector + an ANN
  index is the right call once a query is scoring thousands of bullets, not
  a real trade-off at this scale.
- **The eval harness is a manual script, not a CI gate**, on purpose — it
  calls real, paid APIs, which has no business running on every push (cost,
  flakiness, and it'd mean CI secrets holding a real API key). It's real
  though: golden fixtures with human-judged expected outcomes, run against
  the actual model, with a second Claude call acting as an independent judge
  for the one thing that's hard to assert with `expect()` — whether prose
  stayed faithful to its cited evidence.
- **The cover-letter agent's self-reported citations are re-validated
  server-side** against real bullet ids before saving — treating anything
  the model reports about itself as a claim, not a fact, is the same
  instinct as never trusting client input.
