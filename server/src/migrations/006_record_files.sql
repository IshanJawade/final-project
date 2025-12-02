CREATE TABLE IF NOT EXISTS record_files (
    id SERIAL PRIMARY KEY,
    record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    medical_professional_id INTEGER NOT NULL REFERENCES medical_professionals(id),
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_encrypted BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_record_files_record_id ON record_files(record_id);
CREATE INDEX IF NOT EXISTS idx_record_files_professional_id ON record_files(medical_professional_id);
