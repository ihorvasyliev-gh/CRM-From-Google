-- 1. Add updated_at column to enrollments if it doesn't exist
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Set updated_at to created_at for all old records so they sort properly
UPDATE enrollments SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Create or replace the function to automatically update the timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Add a trigger to the enrollments table
DROP TRIGGER IF EXISTS update_enrollments_updated_at ON enrollments;
CREATE TRIGGER update_enrollments_updated_at
BEFORE UPDATE ON enrollments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
