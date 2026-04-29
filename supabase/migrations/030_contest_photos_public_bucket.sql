-- Ensure contest uploads remain publicly readable in environments where the
-- bucket existed before the contest migration was applied.

INSERT INTO storage.buckets (id, name, public)
VALUES ('contest-photos', 'contest-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;
