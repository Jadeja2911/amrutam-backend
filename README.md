# Amrutam Telemedicine Backend

Production-grade backend for a telemedicine platform: user auth, doctor
availability, consultation booking, prescriptions, search, and admin
analytics.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for system design details and
[`SECURITY.md`](./SECURITY.md) for the threat model and security checklist.

## Tech Stack

- **Runtime**: Node.js (TypeScript entry point, JavaScript route modules)
- **Framework**: Express
- **Database**: PostgreSQL (via [Neon](https://neon.tech), works with any
  Postgres) + Prisma ORM
- **Auth**: JWT + bcrypt password hashing
- **Package manager**: pnpm

## Project Structure

```
artifacts/api-server/
├── prisma/
│   └── schema.prisma        # Data model
├── src/
│   ├── index.ts              # Entry point — starts the HTTP server
│   ├── app.ts                 # Express app, middleware & route mounting
│   ├── middleware/
│   │   └── auth.js            # JWT verification + role-based access control
│   ├── services/
│   │   └── bookingService.js  # Core booking transaction (locking + idempotency)
│   └── routes/
│       ├── authRoutes.js
│       ├── availabilityRoutes.js
│       ├── bookingRoutes.js
│       ├── consultationRoutes.js
│       ├── searchRoutes.js
│       └── analyticsRoutes.js
└── package.json
```

## Prerequisites

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- A PostgreSQL database (a free [Neon](https://neon.tech) project works well)

## Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/Jadeja2911/amrutam-backend.git
   cd amrutam-backend/artifacts/api-server
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```
   If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds` and
   approve all listed packages (needed for Prisma's native binaries).

3. **Configure environment variables**

   Create a `.env` file in `artifacts/api-server/` (see `.env.example`):
   ```env
   PORT=3000
   DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require
   JWT_SECRET=<a long random string>
   ```

4. **Push the schema to your database**
   ```bash
   npx prisma db push
   ```

5. **Build and start**
   ```bash
   pnpm run build
   pnpm run start
   ```
   Or, for build+start in one step:
   ```bash
   pnpm run dev
   ```

   You should see:
   ```
   Server listening on port 3000
   ```

## Quick Smoke Test

```bash
# Sign up a doctor
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor1@test.com","password":"Test@1234","role":"DOCTOR"}'

# Log in
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor1@test.com","password":"Test@1234"}'
# → copy the returned token for subsequent authenticated requests

# Search doctors (public)
curl "http://localhost:3000/api/doctors"
```

## API Documentation

See [`openapi.yaml`](./openapi.yaml) for the full API schema, importable into
Postman, Swagger UI, or Insomnia.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm run build` | Compile/bundle to `dist/` |
| `pnpm run start` | Run the compiled server |
| `pnpm run dev` | Build + start in one step |
| `pnpm run typecheck` | Type-check without emitting |
| `npx prisma db push` | Sync schema to the database (no migration history) |
| `npx prisma migrate deploy` | Apply tracked migrations (production) |

## Deployment Notes

- Runs as a stateless container — any container platform (Fly.io, Render,
  ECS, Cloud Run) works. Set the three environment variables above as
  secrets, never as plain build args.
- Health check endpoint: `GET /health` → `{ "status": "ok" }`.
