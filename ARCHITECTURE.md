# Amrutam Telemedicine Backend — Architecture Document

## 1. Overview

This document describes the architecture of the Amrutam telemedicine backend: a
Node.js/Express + PostgreSQL (Prisma ORM) system supporting patient/doctor
authentication, doctor availability management, consultation booking,
prescriptions, search, and admin analytics — built to the assignment's
non-functional targets (100k consultations/day, p95 <200ms reads / <500ms
writes, 99.95% availability).

## 2. High-Level Architecture

```
                         ┌─────────────────────┐
                         │   Client (Web/App)  │
                         └──────────┬───────────┘
                                    │ HTTPS
                                    ▼
                         ┌─────────────────────┐
                         │   Load Balancer /    │
                         │   Reverse Proxy      │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌───────────┐  ┌───────────┐   ┌───────────┐
             │  API Node │  │  API Node │   │  API Node │   (horizontally
             │ (Express) │  │ (Express) │   │ (Express) │    scaled,
             └─────┬─────┘  └─────┬─────┘   └─────┬─────┘    stateless)
                    │               │               │
       ┌────────────┼───────────────┼───────────────┼───────────────┐
       ▼            ▼               ▼               ▼               ▼
┌─────────────┐ ┌─────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│  Auth        │ │ Booking │  │ Consultation│ │ Search /   │  │ Admin       │
│  Middleware  │ │ Service │  │ Service     │ │ Doctor     │  │ Analytics   │
│  (JWT/RBAC)  │ │         │  │             │ │ Directory  │  │             │
└─────────────┘ └────┬────┘  └──────┬──────┘  └─────┬──────┘  └─────┬──────┘
                      └──────────────┴────────────────┴───────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────┐
                       │   PostgreSQL (Primary)    │
                       │  + Read Replica(s)        │
                       └─────────────┬─────────────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                  ┌───────────────┐    ┌─────────────────┐
                  │ Redis (cache, │    │ Async Job Queue  │
                  │ rate limiting)│    │ (notifications,  │
                  │               │    │  reminders)      │
                  └───────────────┘    └─────────────────┘
```

**Modules** are organized as independent Express routers with dependency
injection via a shared Prisma client, so each domain (auth, booking,
availability, consultations, search, analytics) can, if needed, be split into
a separate deployable service without changing its internal logic.

## 3. Data Flow — Booking a Consultation

1. Patient authenticates → receives JWT (contains `userId`, `role`).
2. Patient calls `GET /api/doctors?specialization=...` to find a doctor
   (read path, cached, replica-served).
3. Patient calls `GET /api/availability/:doctorId` to see open slots.
4. Patient calls `POST /api/bookings` with `{ slotId, idempotencyKey }` and
   `Authorization: Bearer <token>`.
5. Auth middleware verifies JWT, attaches `req.user`.
6. Booking service opens a DB transaction:
   a. Checks `idempotencyKey` — if a consultation already exists for it,
      returns the existing record (safe retry).
   b. `SELECT ... FOR UPDATE` locks the target `AvailabilitySlot` row.
   c. Verifies the slot is not already booked.
   d. Marks the slot booked, creates the `Consultation` row, writes an
      `AuditLog` entry — all inside the same transaction.
7. Transaction commits → 201 response with the consultation.
8. (Planned) An async job enqueues a confirmation notification so the
   HTTP response isn't blocked on email/SMS delivery.

## 4. Booking Flow — Sequence Diagram

```
Patient          API (Auth)      Booking Service        DB (Postgres)
  |                  |                   |                    |
  |--POST /bookings->|                   |                    |
  |  (JWT, slotId)    |--verify JWT------>|                    |
  |                  |<--userId, role----|                    |
  |                  |--forward request->|                    |
  |                  |                   |--BEGIN TX--------->|
  |                  |                   |--check idempKey--->|
  |                  |                   |<--not found--------|
  |                  |                   |--SELECT slot       |
  |                  |                   |  FOR UPDATE------->|
  |                  |                   |<--slot (unbooked)--|
  |                  |                   |--UPDATE slot------>|
  |                  |                   |  isBooked=true      |
  |                  |                   |--INSERT            |
  |                  |                   |  consultation------>|
  |                  |                   |--INSERT audit_log-->|
  |                  |                   |--COMMIT----------->|
  |                  |<--201 Created-----|                    |
  |<--consultation---|                   |                    |
```

If a second request races in for the same slot, its `SELECT ... FOR UPDATE`
blocks until the first transaction commits, then sees `isBooked = true` and
returns `409 SLOT_ALREADY_BOOKED` — no double-booking is possible.

## 5. ER Diagram (Core Tables)

```
User (1) ──── (1) Profile
User (1) ──── (1) Doctor ──── (*) AvailabilitySlot (1) ──── (1) Consultation
User (1) ──── (*) Consultation [as patient]
Consultation (1) ──── (1) Prescription
Consultation (1) ──── (1) Payment
User (1) ──── (*) AuditLog
```

| Table | Key Fields | Notes |
|---|---|---|
| `User` | id, email (unique), passwordHash, role, mfaEnabled | Auth root entity |
| `Profile` | userId (unique), fullName, phone | Split from User for PII isolation |
| `Doctor` | userId (unique), specialization, licenseNo (unique), consultFee | 1:1 with User |
| `AvailabilitySlot` | doctorId, startTime, endTime, isBooked | Unique on (doctorId, startTime) |
| `Consultation` | patientId, doctorId, slotId (unique), status, idempotencyKey (unique) | Central booking record |
| `Prescription` | consultationId (unique), content | Only after `COMPLETED` |
| `Payment` | consultationId (unique), amount, status | |
| `AuditLog` | userId, action, entity, entityId, metadata (json) | Compliance trail |

## 6. API Surface (Summary)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | Public | Create user |
| POST | `/api/auth/login` | Public | Issue JWT |
| POST | `/api/availability` | Doctor | Create a slot |
| GET | `/api/availability/:doctorId` | Public | List open slots |
| POST | `/api/bookings` | Patient | Book a slot (idempotent) |
| PATCH | `/api/consultations/:id/complete` | Doctor | Mark completed |
| PATCH | `/api/consultations/:id/cancel` | Patient/Doctor | Cancel + release slot |
| POST | `/api/consultations/:id/prescription` | Doctor | Attach prescription |
| GET | `/api/consultations/:id` | Patient/Doctor | Fetch consultation |
| GET | `/api/doctors` | Public | Search/filter doctors |
| GET | `/api/admin/summary` | Admin | Aggregate metrics |

Full request/response schemas are in `openapi.yaml`.

## 7. Retry & Backoff Strategy

- **Client-side retries** (network blips, 5xx) should use exponential backoff
  with jitter (e.g., 200ms, 400ms, 800ms, capped at 3 attempts) and must
  always reuse the same `idempotencyKey` for write operations, so retries are
  safe no-ops rather than duplicate bookings.
- **Server-side transaction timeout**: booking transactions carry a 5s
  timeout so a stalled lock cannot hold up the connection pool indefinitely;
  callers see a `500`/`503` and can retry with the same idempotency key.
- **Downstream integrations** (payment gateway, notification service — not
  yet implemented) should use a circuit breaker: after N consecutive
  failures, short-circuit for a cool-down window before retrying, to avoid
  cascading latency into the booking path.

## 8. Data Partitioning

At 100k consultations/day (~3M/month), a few years of data grows into the
tens-of-millions-of-rows range for `Consultation` and `AuditLog`. Planned
approach:

- **Time-based (range) partitioning** on `Consultation.createdAt` and
  `AuditLog.createdAt` (e.g., monthly partitions via native PostgreSQL
  declarative partitioning), so old partitions can be moved to cheaper
  storage or archived without touching hot data.
- **Read replicas** for search/analytics queries, keeping the primary free
  for booking writes.
- Doctor/availability data is comparatively small and does not need
  partitioning at this scale.

## 9. Caching & Concurrency Handling

- **Concurrency (booking correctness)**: pessimistic row-level locking
  (`SELECT ... FOR UPDATE`) inside a single DB transaction, chosen over
  optimistic locking because booking is a short, high-contention critical
  section where correctness matters more than raw throughput (see trade-off
  discussion below).
- **Idempotency**: every write to `/api/bookings` carries a client-supplied
  `idempotencyKey`, stored unique on `Consultation`. A retried request with
  the same key returns the original result instead of erroring or
  duplicating.
- **Caching (reads)**: doctor search/listing results are good candidates for
  a short-TTL Redis cache (e.g., 30–60s) since they change infrequently
  relative to read volume; booking/consultation state is never cached
  because it must always reflect the latest committed state.
- **Rate limiting**: planned at the API gateway/middleware layer (e.g.,
  token-bucket per user/IP) to protect against abuse and accidental retry
  storms.

### Pessimistic vs. Optimistic Locking — chosen trade-off

| | Pessimistic (`FOR UPDATE`) | Optimistic (version column) |
|---|---|---|
| Correctness | Guaranteed, no lost updates | Possible, requires retry logic on conflict |
| Throughput under high contention | Lower (requests queue) | Higher (no waiting) |
| Complexity | Simple | More app-level retry code |
| Fit for booking | **Chosen** — short critical section, correctness is non-negotiable | Better for low-conflict resources (e.g., profile edits) |

## 10. Transaction Management & Sagas

- **Single-service transactions** (booking, cancellation) use native
  PostgreSQL ACID transactions — all-or-nothing, no distributed coordination
  needed since everything lives in one database today.
- **Saga pattern (future/at scale)**: once payments move to an external
  gateway and notifications move to a separate service, booking becomes a
  multi-step distributed process:
  1. Reserve slot (local transaction, as today).
  2. Call payment gateway.
  3. On payment success → confirm consultation.
  4. On payment failure → **compensating action**: release the slot,
     mark consultation `CANCELLED`.
  This will be implemented as an **orchestrated saga** (a coordinator service
  or a state machine within the booking service) rather than choreography,
  for easier debugging and observability at this system's scale.

## 11. Backup & Disaster Recovery

- **Database**: managed PostgreSQL (Neon) provides automated continuous
  backups and point-in-time recovery; production deployment should enable
  daily snapshots retained for 30 days plus PITR for the last 7 days.
- **RPO/RTO targets**: RPO ≤ 5 minutes (via continuous WAL archiving), RTO ≤
  1 hour for full restore in a region failure.
- **Multi-AZ**: primary + standby replica in a different availability zone
  for automatic failover.
- **Application layer**: stateless API nodes mean DR for compute is just
  redeploying containers from the existing image in a new region/zone.

## 12. Availability & Scaling Notes

- API servers are stateless (JWT auth, no server-side sessions) → horizontally
  scalable behind a load balancer.
- Reads (search, availability listing) are separated conceptually from
  writes (booking) so read replicas can absorb search traffic without
  impacting booking latency.
- 99.95% availability target implies ~4.4 hours of downtime/year budget —
  achieved primarily through: multi-instance API deployment, managed DB with
  automatic failover, and health-check-based rolling deployments (no
  single-instance restarts causing full outages).

## 13. Known Gaps / Next Steps

- `/api/admin/summary` does not yet enforce `requireRole('ADMIN')` —
  tracked as a security TODO (see `SECURITY.md`).
- Async job queue (notifications, reminders) is designed but not yet
  implemented; currently out of the critical path by design.
- Redis caching layer is designed but not yet wired in; current read
  latency is acceptable at present test scale without it.
