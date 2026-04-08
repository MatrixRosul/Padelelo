# PadelElo Backend

Backend scaffold for doubles-first padel Elo platform.

## Stack

- NestJS + TypeScript
- PostgreSQL + Prisma
- Redis + BullMQ
- JWT auth + RBAC
- Swagger OpenAPI
- Jest tests
- Docker (Postgres + Redis)

## Domain Highlights

- Every player starts at Elo 1400.
- Every match is strict 2v2.
- Team Elo is average of two player ratings.
- Winner team players receive same delta; loser team players get opposite delta.
- Elo parameters are centralized in `EloConfig` and consumed via `RatingsService`.
- Full rating history is persisted in `RatingHistory` after each processed match.
- Recompute ratings from scratch is supported via ratings service and import job.

## Modules

- `auth`: register, login, me
- `users`: user read/admin operations
- `players`: profile read/update + player match history
- `tournaments`: create/edit/publish/open-close registration/generate draw
- `registrations`: tournament registration workflows
- `matches`: create match, submit result, simulate result
- `ratings`: Elo config and rating engine
- `leaderboard`: global and category leaderboards
- `imports`: CSV import job API + BullMQ processor
- `admin`: dashboard and audit log
- `common`: guards/decorators/shared utils
- `prisma`: database access service

## Run Locally

1. Copy env values:
   - `cp .env.example .env`
2. Start databases:
   - `docker compose up -d`
3. Install dependencies:
   - `npm install`
4. Run migrations and generate client:
   - `npm run prisma:generate`
   - `npx prisma migrate dev --name init`
5. Seed sample data:
   - `npm run prisma:seed`
6. Start API:
   - `npm run start:dev`
7. Swagger:
   - `http://localhost:4000/api/docs`

## Tests

- Unit tests:
  - `npm test`
