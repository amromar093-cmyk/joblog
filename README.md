# JobLog

[![CI](https://github.com/amromar093-cmyk/joblog/actions/workflows/ci.yml/badge.svg)](https://github.com/amromar093-cmyk/joblog/actions/workflows/ci.yml)

A job-application tracker API — built to actually manage my own job search,
and to prove I can design a backend from nothing: no Supabase, no Firebase,
just Express, Postgres, and my own auth.

Track every application (company, role, status), and every application keeps
its own timeline — a status change logs itself automatically, and you can
drop in a manual follow-up note ("recruiter called," "sent a nudge email").

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

Status is one of `WISHLIST · APPLIED · INTERVIEWING · OFFER · REJECTED · WITHDRAWN`.

Every `:id` route 404s (not 403) for an application that belongs to someone
else — indistinguishable from it not existing at all, so ids can't be probed.

## Testing

```bash
npm test               # unit — no DB needed: hashing, JWTs, validation
npm run test:integration  # real routes against real Postgres — needs DATABASE_URL
```

`.github/workflows/ci.yml` runs both, with a throwaway Postgres service
container for the integration suite — every push is verified against a real
database, not a mock.

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
