ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;

UPDATE users
SET
  first_name = COALESCE(NULLIF(split_part(name, ' ', 1), ''), name),
  last_name = COALESCE(
    NULLIF(
      CASE
        WHEN strpos(name, ' ') > 0 THEN trim(substring(name FROM strpos(name, ' ') + 1))
        ELSE ''
      END,
      ''
    ),
    ''
  ),
  date_of_birth = CASE
    WHEN year_of_birth BETWEEN 1900 AND 2100 THEN make_date(year_of_birth, 1, 1)
    ELSE DATE '1970-01-01'
  END
WHERE first_name IS NULL OR last_name IS NULL OR date_of_birth IS NULL;

ALTER TABLE users
  ALTER COLUMN first_name SET DEFAULT '',
  ALTER COLUMN last_name SET DEFAULT '',
  ALTER COLUMN date_of_birth SET DEFAULT DATE '1970-01-01';

UPDATE users
SET
  first_name = COALESCE(first_name, ''),
  last_name = COALESCE(last_name, ''),
  date_of_birth = COALESCE(date_of_birth, DATE '1970-01-01');

UPDATE users
SET
  name = trim(concat_ws(' ', first_name, last_name)),
  year_of_birth = EXTRACT(YEAR FROM date_of_birth)::INT
WHERE name IS DISTINCT FROM trim(concat_ws(' ', first_name, last_name))
   OR year_of_birth IS DISTINCT FROM EXTRACT(YEAR FROM date_of_birth)::INT;

ALTER TABLE users
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL,
  ALTER COLUMN date_of_birth SET NOT NULL;
