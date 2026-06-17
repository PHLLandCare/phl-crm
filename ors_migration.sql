-- migration: add ors_api_key to org_settings for OpenRouteService-based route optimization
-- (replaces the earlier google_maps_api_key approach — Google's Distance Matrix API is
--  now Legacy/restricted for new projects and requires billing/card on file even within
--  the free tier; OpenRouteService is free with no card required and covers our stop
--  counts comfortably)

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS ors_api_key text;

-- rollback:
-- ALTER TABLE org_settings DROP COLUMN IF EXISTS ors_api_key;
