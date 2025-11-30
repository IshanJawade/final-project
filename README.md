# Medical Access Control MVP

A minimal full-stack application that lets patients control access to their encrypted medical records. Admins approve accounts and medical professionals can only see patient data after access is granted.

## Project Structure

```
actual-vscode/
├── client/   # React SPA
└── server/   # Express + PostgreSQL API
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ with a database ready for the app

## Environment Variables

Copy `.env.example` to `.env` (adjust as needed for server and client).

Required values:

- `DATABASE_URL` – Postgres connection string, e.g. `postgresql://user:pass@localhost:5432/hipaa_mvp`
- `JWT_SECRET` – long random string for signing tokens
- `AES_KEY` – 32 byte key in base64 or hex (e.g. `openssl rand -base64 32`)
- `PORT` – optional, defaults to 4000
- `VITE_API_URL` – client API base (defaults to `http://localhost:4000`)

## Backend Setup

```bash
cd server
npm install
npm run migrate
npm run seed
npm run dev
```

The seed script creates:

- Admins: `admin1` / `AdminPass123!`, `admin2` / `AdminPass456!`
- Approved users: `alice.patient@example.com` / `PatientPass123!`, `bob.patient@example.com` / `PatientPass456!`
- Approved medical professionals: `drsarah` / `DoctorPass123!`, `drjohn` / `DoctorPass456!`

## Frontend Setup

```bash
cd client
npm install
npm run dev
```

Open the address Vite prints (default `http://localhost:5173`).

## Core Flows to Try

Top navigation now exposes dedicated pages for each role (Profile, Records/Patients, Access/Requests). After signing in, use the right-aligned tabs to jump between workflows.

1. Register a new patient or medical professional
2. Sign in as `admin1` and approve pending accounts
3. Sign in as an approved medical professional, search for a patient, and submit an access request (Access Requests tab)
4. Sign in as the patient, approve or decline pending requests (Access tab, optionally set an expiry), and download records (Records tab)
5. With access granted, sign in as the medical professional to add a new record (Patients tab) and confirm it appears in the patient portal

## Security Notes

- Passwords hashed with bcrypt
- JWT auth with role claims protects all sensitive endpoints
- Medical record payloads encrypted at rest using AES-256-GCM
- All database queries use parameterised statements via `pg`

## Testing Checklist

Manual happy-path tests:

- [ ] User registration → admin approval → login
- [ ] Professional search → access request → patient approval/decline
- [ ] Record creation by medical professional → patient visibility/download
- [ ] Patient revoke removes professional access
- [ ] Admin approval for users and professionals

Extend with automated tests as the system evolves.
