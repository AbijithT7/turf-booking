-- 001_initial.sql
CREATE TABLE IF NOT EXISTS Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Turfs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  meta TEXT NOT NULL,
  basePrice INTEGER NOT NULL,
  panoramaUrl TEXT
);

CREATE TABLE IF NOT EXISTS Bookings (
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

CREATE TABLE IF NOT EXISTS BlockedSlots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turf_id INTEGER NOT NULL REFERENCES Turfs(id),
  blocked_date DATE NOT NULL,
  slot_hour INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(turf_id, blocked_date, slot_hour)
);

CREATE TABLE IF NOT EXISTS TeamOpenings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turf_id INTEGER REFERENCES Turfs(id),
  user_id INTEGER REFERENCES Users(id),
  sport TEXT NOT NULL,
  seats INTEGER NOT NULL,
  team_size INTEGER NOT NULL,
  fare INTEGER NOT NULL DEFAULT 0,
  creator_phone TEXT,
  creator_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS TeamRequests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opening_id INTEGER NOT NULL REFERENCES TeamOpenings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES Users(id),
  requester_name TEXT,
  requester_phone TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS CommunityPosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES Users(id),
  post_type TEXT NOT NULL,
  sport TEXT NOT NULL,
  team_name TEXT NOT NULL,
  turf TEXT,
  spots INTEGER DEFAULT 1,
  fare INTEGER DEFAULT 0,
  event_date DATE,
  event_time TEXT,
  prize_pool TEXT,
  max_teams INTEGER DEFAULT 16,
  status TEXT DEFAULT 'Open',
  created_by_name TEXT,
  created_by_phone TEXT,
  created_by_email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS CommunityRequests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES CommunityPosts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES Users(id),
  applicant_name TEXT,
  applicant_phone TEXT,
  applicant_team TEXT,
  applicant_email TEXT,
  upi_ref TEXT,
  status TEXT DEFAULT 'Pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
