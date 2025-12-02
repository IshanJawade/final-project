CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table adjustments
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN last_name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN date_of_birth DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_encrypted TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_key ON users(email_hash);

UPDATE users
SET email_hash = encode(digest(lower(email), 'sha256'), 'hex')
WHERE email IS NOT NULL AND email_hash IS NULL;

UPDATE users
SET profile_encrypted = to_jsonb(
  json_build_object(
    'firstName', NULLIF(first_name, ''),
    'lastName', NULLIF(last_name, ''),
    'fullName', NULLIF(name, ''),
    'email', NULLIF(email, ''),
    'mobile', NULLIF(mobile, ''),
    'address', NULLIF(address, ''),
    'dateOfBirth', CASE WHEN date_of_birth IS NOT NULL THEN to_char(date_of_birth, 'YYYY-MM-DD') ELSE NULL END,
    'yearOfBirth', year_of_birth
  )
)::text
WHERE profile_encrypted IS NULL;

UPDATE users
SET email_encrypted = COALESCE(email_encrypted, email);

UPDATE users
SET first_name = NULL,
    last_name = NULL,
    name = NULL,
    email = NULL,
    mobile = NULL,
    address = NULL,
    date_of_birth = NULL
WHERE first_name IS NOT NULL
   OR last_name IS NOT NULL
   OR name IS NOT NULL
   OR email IS NOT NULL
   OR mobile IS NOT NULL
   OR address IS NOT NULL
   OR date_of_birth IS NOT NULL;

ALTER TABLE users ALTER COLUMN email_hash SET NOT NULL;
ALTER TABLE users ALTER COLUMN email_encrypted SET NOT NULL;
ALTER TABLE users ALTER COLUMN profile_encrypted SET NOT NULL;
ALTER TABLE users ALTER COLUMN profile_encrypted SET DEFAULT '{}'::text;

-- Medical professionals table adjustments
ALTER TABLE medical_professionals ALTER COLUMN name DROP NOT NULL;
ALTER TABLE medical_professionals ALTER COLUMN email DROP NOT NULL;

ALTER TABLE medical_professionals ADD COLUMN IF NOT EXISTS email_hash TEXT;
ALTER TABLE medical_professionals ADD COLUMN IF NOT EXISTS email_encrypted TEXT;
ALTER TABLE medical_professionals ADD COLUMN IF NOT EXISTS profile_encrypted TEXT;

ALTER TABLE medical_professionals DROP CONSTRAINT IF EXISTS medical_professionals_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS medical_professionals_email_hash_key ON medical_professionals(email_hash);

UPDATE medical_professionals
SET email_hash = encode(digest(lower(email), 'sha256'), 'hex')
WHERE email IS NOT NULL AND email_hash IS NULL;

UPDATE medical_professionals
SET profile_encrypted = to_jsonb(
  json_build_object(
    'name', NULLIF(name, ''),
    'email', NULLIF(email, ''),
    'mobile', NULLIF(mobile, ''),
    'address', NULLIF(address, ''),
    'company', NULLIF(company, '')
  )
)::text
WHERE profile_encrypted IS NULL;

UPDATE medical_professionals
SET email_encrypted = COALESCE(email_encrypted, email);

UPDATE medical_professionals
SET name = NULL,
    email = NULL,
    mobile = NULL,
    address = NULL,
    company = NULL
WHERE name IS NOT NULL
   OR email IS NOT NULL
   OR mobile IS NOT NULL
   OR address IS NOT NULL
   OR company IS NOT NULL;

ALTER TABLE medical_professionals ALTER COLUMN email_hash SET NOT NULL;
ALTER TABLE medical_professionals ALTER COLUMN email_encrypted SET NOT NULL;
ALTER TABLE medical_professionals ALTER COLUMN profile_encrypted SET NOT NULL;
ALTER TABLE medical_professionals ALTER COLUMN profile_encrypted SET DEFAULT '{}'::text;

-- Admins table adjustments
ALTER TABLE admins ALTER COLUMN name DROP NOT NULL;
ALTER TABLE admins ALTER COLUMN email DROP NOT NULL;

ALTER TABLE admins ADD COLUMN IF NOT EXISTS email_hash TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS email_encrypted TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS profile_encrypted TEXT;

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_hash_key ON admins(email_hash);

UPDATE admins
SET email_hash = encode(digest(lower(email), 'sha256'), 'hex')
WHERE email IS NOT NULL AND email_hash IS NULL;

UPDATE admins
SET profile_encrypted = to_jsonb(
  json_build_object(
    'name', NULLIF(name, ''),
    'email', NULLIF(email, ''),
    'mobile', NULLIF(mobile, ''),
    'address', NULLIF(address, '')
  )
)::text
WHERE profile_encrypted IS NULL;

UPDATE admins
SET email_encrypted = COALESCE(email_encrypted, email);

UPDATE admins
SET name = NULL,
    email = NULL,
    mobile = NULL,
    address = NULL
WHERE name IS NOT NULL
   OR email IS NOT NULL
   OR mobile IS NOT NULL
   OR address IS NOT NULL;

ALTER TABLE admins ALTER COLUMN email_hash SET NOT NULL;
ALTER TABLE admins ALTER COLUMN email_encrypted SET NOT NULL;
ALTER TABLE admins ALTER COLUMN profile_encrypted SET NOT NULL;
ALTER TABLE admins ALTER COLUMN profile_encrypted SET DEFAULT '{}'::text;
