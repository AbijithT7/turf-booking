-- 005_turf_ownership.sql
-- Add nullable ownership so existing turfs and bookings remain intact.
ALTER TABLE Turfs ADD COLUMN owner_id INTEGER REFERENCES Users(id);
CREATE INDEX IF NOT EXISTS idx_turfs_owner ON Turfs(owner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_turf_date ON Bookings(turf_id, booking_date);
