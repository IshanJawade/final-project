# Medical Records System (MRS) - Skeleton

This repository contains a skeleton for a HIPAA-conscious Medical Records System (MRS).

Quick start (development):

1. Copy `.env.example` to `.env` in `server/` and edit secrets (default Postgres creds: user `postgres`, password `PostGreSQL`, DB `new-medical`).
2. Start services:

```bash
# from repo root
docker-compose up --build
```

3. From `server/` run:

```bash
npm install
npx prisma migrate dev --name init --url "postgresql://postgres:PostGreSQL@localhost:5433/new-medical?schema=public"
npx prisma db seed --url "postgresql://postgres:PostGreSQL@localhost:5433/new-medical?schema=public"
npm run dev
```

4. From `web/` run:

```bash
npm install
npm run dev
```

What I scaffolded:
- `server/` Express + TypeScript skeleton, Prisma schema, minimal app.
- `web/` Vite + React minimal app.
- `docker-compose.yml` with Postgres and MinIO services.
- `README.md`, `.env.example`, `logs/`, `backups/` directories.

Next steps I can continue with (pick one):
- Implement Auth (JWT access + rotating refresh) and basic RBAC middleware.
- Implement Audit logging to DB + daily JSONL rotation.
- Implement file upload with checksum, size/mimetype checks, and MinIO storage + signed URLs.
- Implement Prisma migrations and seed script for default users & specializations.

Tell me which to do next and I'll continue implementing it.
