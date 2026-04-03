-- Add company-level workflow defaults

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS default_director_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_default_director_fk'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_default_director_fk
      FOREIGN KEY (default_director_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_companies_default_director ON companies(default_director_id);

