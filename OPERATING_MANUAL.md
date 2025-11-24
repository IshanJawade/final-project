# Operating Manual

This document explains how to interact with the HIPAA-conscious Medical Records System (MRS) HTTP APIs. All routes respond with JSON and expect `Content-Type: application/json` unless noted.

## Core Concepts

- **Base URL**: `http://localhost:4000` (adjust to your deployment).
- **Authentication**: Protected routes require `Authorization: Bearer <access_token>` obtained via the auth endpoints plus the secure refresh cookie.
- **Fingerprinting**: Provide the header `X-Device-Fingerprint` with a stable hash per device when logging in or registering. When absent, the server derives one from IP + user agent.
- **Roles**: `ADMIN`, `DOCTOR`, `RECEPTIONIST`, `PATIENT`. Gatekeeping is enforced per endpoint.
- **Audit Logging**: Mutating routes automatically log who performed the action, their IP, and before/after payloads.

---

## Authentication APIs (`/auth`)

### `POST /auth/staff/login`
- **Who**: Staff users (`ADMIN`, `DOCTOR`, `RECEPTIONIST`).
- **Body**:
  ```json
  {
    "email": "doctor@example.com",
    "password": "P@ssw0rd",
    "totp_code": "123456" // required if the account has 2FA enabled
  }
  ```
- **Notes**: Requires the fingerprint header. Returns `access_token`, TTL in seconds, and user summary. Also sets a `mrs_refresh_token` HTTP-only cookie.

### `POST /auth/patient/login`
- **Who**: Patients (identifier can be MRN or email).
- **Body**:
  ```json
  {
    "identifier": "MRN-ABCD-1234",
    "password": "patient-login"
  }
  ```

### `POST /auth/patient/register`
- **Who**: Patients registering themselves with MRN + last name + DOB verification.
- **Body**: `mrn`, `last_name`, `dob (YYYY-MM-DD)`, `email`, `password`.

### `POST /auth/refresh`
- **Who**: Any authenticated user with a refresh cookie.
- **Headers**: Must include the fingerprint header and `mrs_refresh_token` cookie.

### `POST /auth/logout`
- Clears the refresh cookie and revokes the refresh token family.

---

## Patient APIs (`/patients`)

All patient routes require authentication.

### `GET /patients`
- **Roles**: `ADMIN`, `RECEPTIONIST`, `DOCTOR`.
- **Query**:
  - `query`: free-text search across first/last name and MRN.
  - `dob`: `YYYY-MM-DD`.
  - `mrn`: exact MRN.
  - `limit`: 1-100 (default 25).
- **Notes**: Doctors automatically filter to patients tied to their assigned cases.

### `POST /patients`
- **Roles**: `ADMIN`, `RECEPTIONIST`.
- **Body**:
  ```json
  {
    "first_name": "Ada",
    "last_name": "Lovelace",
    "dob": "1980-12-01",
    "phone": "+1-555-0100"
  }
  ```
- **Outcome**: Generates a unique MRN and logs creation.

### `GET /patients/:id`
- **Roles**: Any authenticated user with contextual access (patients only see themselves, doctors only if they have an assigned case, receptionists see intake-level data).

---

## Case APIs (`/cases`)

### `GET /cases`
- **Roles**: `ADMIN`, `DOCTOR`, `RECEPTIONIST`, `PATIENT`.
- **Query**:
  - `status`: `OPEN` or `CLOSED`.
  - `patient_id`: required for receptionists.
  - `doctor_id`: admin only.
  - `limit`: default 25.
- **Behavior**: Filters automatically scope to the current user (doctors → assigned cases, patients → their cases).

### `POST /cases`
- **Roles**: `ADMIN`, `DOCTOR`.
- **Body**:
  ```json
  {
    "patient_id": "uuid",
    "assigned_doctor_id": "uuid",
    "summary": "Headache follow-up",
    "symptoms_text": "Recurring migraine episodes"
  }
  ```
- **Rules**:
  - Doctors can only assign cases to themselves.
  - Fails if patient/doctor IDs are invalid.

### `GET /cases/:id`
- **Roles**: Same as list, with ownership validation.

### `PATCH /cases/:id`
- **Roles**: `ADMIN`, `DOCTOR` (assigned).
- **Body**: Any combination of `summary`, `symptoms_text`, `assigned_doctor_id` (re-assignment restricted to admins).
- **Guards**: Cannot edit closed cases.

### `POST /cases/:id/close`
- **Roles**: `ADMIN`, assigned `DOCTOR`.
- **Body**: Optional `summary` update.
- **Effect**: Marks case `CLOSED`, sets `closed_at`, prevents further visits/prescriptions.

---

## Visits & Prescriptions

### `GET /cases/:caseId/visits`
- **Roles**: `ADMIN`, assigned `DOCTOR`, owning `PATIENT`.
- **Query**: `limit` (1-100, default 25).

### `POST /cases/:caseId/visits`
- **Roles**: Assigned `DOCTOR`.
- **Body**:
  ```json
  {
    "visit_datetime": "2025-01-15T14:00:00Z",
    "vitals": { "bp": "120/78", "hr": 72 },
    "notes": "Symptoms improving"
  }
  ```
- **Rules**:
  - Automatically assigns `visit_number` (sequential per case).
  - Case must be open.

### `GET /visits/:visitId`
- **Roles**: `ADMIN`, assigned `DOCTOR`, owning `PATIENT`.

### `PATCH /visits/:visitId`
- **Roles**: `ADMIN`, assigned `DOCTOR`.
- **Body**: Any combination of `visit_datetime`, `vitals`, `notes`.
- **Rules**: Case must remain open when rescheduling.

### `GET /visits/:visitId/prescription`
- **Roles**: Same as visit detail.
- **Behavior**: Returns 404 if no prescription is on record.

### `PUT /visits/:visitId/prescription`
- **Roles**: Assigned `DOCTOR`.
- **Body**:
  ```json
  {
    "medication_name": "Amoxicillin",
    "dosage": "500mg",
    "frequency": "TID",
    "route": "PO",
    "duration": "7 days",
    "notes": "Take with food"
  }
  ```
- **Rules**: One prescription per visit (this endpoint creates or replaces it). Case must be open.

---

## Availability & Appointments

### `GET /doctors/:doctorId/availability`
- **Roles**: `ADMIN`, `RECEPTIONIST`, `PATIENT`, specific `DOCTOR`.
- **Query**:
  - `from` / `to`: ISO timestamps (defaults to now → +30 days).
  - `include_booked`: boolean (default `false`).
- **Response**: Raw `AvailabilitySlot` entries (`id`, `start_time`, `end_time`, `is_booked`).

### `GET /appointments`
- **Roles**: `ADMIN`, `RECEPTIONIST`, `DOCTOR`, `PATIENT`.
- **Query**:
  - `status`, `doctor_id`, `patient_id`, `case_id`, `from`, `to`, `limit`.
  - Filters auto-scope to the caller (doctor → their calendar, patient → their appointments).

### `GET /appointments/:id`
- **Roles**: Same as list, with ownership validation.

### `POST /appointments`
- **Roles**: `ADMIN`, `RECEPTIONIST`, assigned `DOCTOR`.
- **Body**:
  ```json
  {
    "case_id": "uuid",
    "start_time": "2025-02-01T16:00:00Z",
    "end_time": "2025-02-01T16:30:00Z"
  }
  ```
- **Rules**:
  - Case must exist, be open, and already have an assigned doctor.
  - Doctors may schedule only for their own cases.
  - Automatic conflict detection prevents overlapping `SCHEDULED` appointments for either doctor or patient.
  - Successfully booking toggles the matching availability slot to `is_booked = true` when one spans the requested window.

### `PATCH /appointments/:id`
- **Roles**: `ADMIN`, `RECEPTIONIST`, assigned `DOCTOR`.
- **Body**: Any combination of `start_time`, `end_time`, `status` (one of `SCHEDULED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
- **Rules**:
  - Closed cases cannot be rescheduled, though their status can still update.
  - Time changes re-run conflict checks.
  - Setting `status = CANCELLED` frees the availability slot (if tracked).

---

## Usage Checklist

1. **Authenticate** with the appropriate `/auth` endpoint, sending `X-Device-Fingerprint` and storing the refresh cookie securely.
2. **Attach `Authorization: Bearer`** to every protected call plus `Content-Type: application/json`.
3. **Respect Role Constraints**: The API enforces them, but plan workflows accordingly (e.g., only receptionists/admins can register new patients).
4. **Handle 4xx errors**: Validation failures return RFC-7807 problem details with `title`, `status`, and `detail` for quick triage.
5. **Audit Awareness**: Any mutation is logged with request ID—include the response `request_id` when escalating issues.

This manual should be updated whenever new endpoints are added or business rules evolve.
