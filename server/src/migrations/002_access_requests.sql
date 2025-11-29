ALTER TABLE access
  ADD COLUMN access_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS access_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medical_professional_id INTEGER NOT NULL REFERENCES medical_professionals(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_message TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT access_requests_status CHECK (status IN ('pending', 'approved', 'declined'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_pending_unique
  ON access_requests (user_id, medical_professional_id)
  WHERE status = 'pending';
