-- 003_normalize_bookings.sql
-- Enforces user_id foreign key and UNIQUE(turf_id, booking_date, slot_hour)

CREATE TABLE IF NOT EXISTS Bookings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turf_id INTEGER NOT NULL REFERENCES Turfs(id),
  user_id INTEGER NOT NULL REFERENCES Users(id),
  user_name TEXT,
  user_phone TEXT,
  sport_type TEXT,
  booking_date DATE NOT NULL,
  slot_hour INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(turf_id, booking_date, slot_hour)
);

INSERT INTO Bookings_new (id, turf_id, user_id, user_name, user_phone, sport_type, booking_date, slot_hour)
SELECT 
  b.id,
  b.turf_id,
  COALESCE(
    (SELECT u.id FROM Users u WHERE b.user_phone IS NOT NULL AND b.user_phone != '' AND u.phone = b.user_phone ORDER BY u.id ASC LIMIT 1),
    (SELECT u.id FROM Users u WHERE b.user_name IS NOT NULL AND b.user_name != '' AND u.name = b.user_name ORDER BY u.id ASC LIMIT 1),
    (SELECT u.id FROM Users u WHERE u.email = 'test@turf.com' LIMIT 1),
    (SELECT u.id FROM Users u ORDER BY u.id ASC LIMIT 1)
  ) AS user_id,
  b.user_name,
  b.user_phone,
  b.sport_type,
  b.booking_date,
  b.slot_hour
FROM Bookings b;

DROP TABLE Bookings;

ALTER TABLE Bookings_new RENAME TO Bookings;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_slot ON Bookings(turf_id, booking_date, slot_hour);
