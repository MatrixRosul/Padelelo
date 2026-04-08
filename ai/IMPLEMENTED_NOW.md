# Padelelo - Implemented State

Last updated: 2026-04-08

This document captures what is currently implemented in the repository right now.

## 1) Repository Structure

- frontend
  - Expo React Native app (mobile client)
- backend
  - NestJS + Prisma API and business logic
- data
  - Source CSV datasets for imports
- ai
  - AI-generated project documentation (this file)

Current top-level separation is now frontend + backend.

## 2) Frontend (Expo React Native)

Location: frontend

### 2.1 Core app setup

- App entrypoints and config moved under frontend:
  - App.tsx, app.json, index.ts, tsconfig.json
- Shared API client with dynamic base URL resolution:
  - Uses EXPO_PUBLIC_API_URL when provided
  - Falls back to host from Expo config and port 4000 (/api)
- Global auth token helper:
  - setApiAuthToken / getApiAuthToken
  - Authorization header auto-managed

### 2.2 Authentication

- Auth context with token lifecycle:
  - Sign in, sign out, session bootstrap
  - Token persistence in AsyncStorage (with in-memory fallback)
- Auth-aware API usage and error handling
- Login screen implemented

### 2.3 Navigation

- Bottom tab navigation implemented:
  - Dashboard
  - Leaderboard
  - Matches
  - Tournaments
  - Profile
- Root stack includes PlayerDetails route

### 2.4 Screens and major UI features

#### Dashboard

- Hero panel and quick actions
- Recent strategic feed from player match history
- Recommended rivals list from players endpoint
- Handles loading, empty, and error states

#### Leaderboard

- Global leaderboard with API pagination
- Debounced search by player
- Podium cards (top 3)
- Full ranking list
- Current user highlighting
- W/D/L display in ranking rows
- Removed previous Elite Ladder + region/time-frame filter block

#### Matches

- Match history list for current player
- Summary cards: win rate, completed, record
- Result status labeling (W/L/D)
- Progressive "load more" behavior

#### Tournaments

- Read-only available tournaments view
- Tournament cards with categories and metadata
- Refresh action
- Partner selection and registration controls removed from UI
  - Frontend currently shows availability/discovery only

#### Profile + Player Details

- Full profile analytics component:
  - Elo timeline chart
  - Peak, best gain, worst drop
  - Recent form tokens
  - Match cards with per-match delta pills
- W/D/L profile stats now computed from actual completed match history
  - Draws are no longer dependent only on matchesPlayed - wins - losses fallback
  - Fallback still exists if no completed history is available

### 2.5 Shared frontend modules

- Components:
  - AppTopBar
  - AppButton
  - PlayerProfileInsights
- Hooks:
  - usePlayerProfile
- Utilities:
  - httpError normalization
- Theme:
  - centralized color tokens

## 3) Backend (NestJS + Prisma)

Location: backend

### 3.1 Platform and architecture

- NestJS modular backend with AppModule wiring
- Prisma ORM + PostgreSQL schema
- Global config + validation pipeline
- Swagger docs enabled at /api/docs
- Health endpoint provided

### 3.2 Implemented modules

- auth
  - register, login, me
  - JWT strategy and guards
- users
  - admin-level user listing and lookup
- players
  - list/search players
  - player profile by id/nickname/email
  - player match history endpoint
  - player profile update endpoint
- tournaments
  - create/list/get/update
  - publish, open/close registration
  - generate draw
- registrations
  - team registration into tournament category
  - registration listing
  - eligibility checks
- matches
  - create match
  - submit result
  - simulate result
  - match details
- ratings
  - active Elo config read/update
  - apply ratings for completed matches
  - full recompute from scratch
- leaderboard
  - global leaderboard
  - category leaderboard
  - pagination and optional filtering
- imports
  - CSV import pipeline
  - import job logging and auditing
- admin
  - dashboard counters
  - audit log feed

### 3.3 Security and role model

- UserRole: PLAYER / ADMIN
- JWT auth guard
- Role-based access guard and decorator
- Admin-only protection for sensitive endpoints (imports, admin, many mutation routes)

### 3.4 Prisma data model

Implemented entities include:

- User, PlayerProfile
- Tournament, TournamentCategory, TournamentTeam, TournamentRegistration
- Match, MatchTeam, MatchSetScore
- RatingHistory, EloConfig
- CSVImportJob, AuditLog

Enums include user roles, tournament lifecycle, registration statuses, match statuses, result sources, bracket stages, and rating/import metadata.

### 3.5 Rating engine behavior

- Team-average Elo model for doubles
- Expected score via Elo formula
- Delta computed with K-factor weighting
- Per-player K-factor tiers by experience
- League/category multiplier support
- Match team snapshots store expected/actual score and ratingDelta
- Recompute flow resets and reapplies ratings over completed rated matches

### 3.6 CSV import pipeline

- Supports 2 input schemas:
  - email-based schema
  - legacy league schema
- Validation and normalization flow
- Auto player account/profile creation for unknown players
- Import creates tournament + categories and imported matches
- Rating recomputation after import
- Import jobs tracked with status and metadata
- Audit logs for success/failure events

### 3.7 Scripts and seeding

- backend/scripts/import-matches-csv.ts
  - CLI import helper for CSV ingestion
- backend/prisma/seed.ts
  - seed users, players, tournament data, matches, and sample logs

## 4) Data Assets

Location: data

- matches.csv
  - large historical match dataset
- players.csv
  - player names dataset

These files are available for import and backfill workflows.

## 5) Integration Status

- Frontend consumes backend endpoints through axios client
- Auth token is propagated to API requests
- Leaderboard, profile, and match history are wired to live backend endpoints
- Tournament registration backend exists, but frontend registration UI is intentionally simplified/removed for now

## 6) Current UX Decisions

- App naming and branding updated to Padelelo
- Profile now shows match-level Elo deltas in history cards
- Leaderboard simplified for clarity (no region/time filter controls)
- Tournaments screen currently focused on discovery of available events

## 7) Run Commands After Restructure

### Frontend

- cd frontend
- npm install
- npm run start

Optional env:

- EXPO_PUBLIC_API_URL=http://<host>:4000/api

### Backend

- cd backend
- npm install
- npm run start:dev

Database/Prisma commands remain under backend.

## 8) Notes for Next Iterations

Potential next tasks (not required for current state):

- Reintroduce tournament registration UX in frontend when flow is finalized
- Add dedicated frontend documentation and architecture diagram
- Add end-to-end tests for auth + import + rating recompute critical path
