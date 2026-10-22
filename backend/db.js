const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const { runMigrations } = require('./migrations');

let dbInstance = null;

async function initDB(dbPath = path.join(__dirname, 'turf.db')) {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign key enforcement
  await dbInstance.exec('PRAGMA foreign_keys = ON;');

  // Run migrations and seed default admin/users
  await runMigrations(dbInstance);

  // Seed turfs if none exist
  const count = await dbInstance.get('SELECT COUNT(*) as count FROM Turfs');
  if (count.count < 8) {
    await dbInstance.exec(`
      INSERT INTO Turfs (id, name, meta, basePrice, panoramaUrl) VALUES 
      (1, 'GreenLine Arena', 'Velachery • Football, Box Cricket', 1200, 'turf1-360.jpg'),
      (2, 'Boundary Line Arena', 'Tambaram • Box Cricket', 900, 'turf2-360.jpg'),
      (3, 'SkyLine Rooftop Hub', 'OMR Sholinganallur • Multi-Sport & Futsal', 1100, 'turf3-360.jpg'),
      (4, 'SmashPro Badminton Dome', 'Anna Nagar • Badminton (BWF Standard)', 750, 'turf4-360.jpg'),
      (5, 'Adyar Grand Slam Club', 'Adyar • Tennis & Pickleball', 1000, 'turf5-360.jpg'),
      (6, 'Hoops City Arena', 'T. Nagar • Basketball (FIBA Indoor)', 1300, 'turf6-360.jpg'),
      (7, 'AquaMarine Aquatic Center', 'ECR Palavakkam • Swimming & Aquatics', 600, 'turf7-360.jpg'),
      (8, 'Titan Sports Complex', 'Porur • Futsal & Box Cricket', 1150, 'turf8-360.jpg')
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        meta = excluded.meta,
        basePrice = excluded.basePrice,
        panoramaUrl = excluded.panoramaUrl;
    `);
    console.log('Seeded database with 8 turf facilities.');
  }

  // Fresh databases seed their facilities after migrations, so fill the
  // opening rules here as well as in migration 007.
  await dbInstance.exec(`
    UPDATE Turfs SET sport_config = CASE id
      WHEN 1 THEN '[{"sport":"Football","teamSize":11},{"sport":"Box Cricket","teamSize":8}]'
      WHEN 2 THEN '[{"sport":"Box Cricket","teamSize":8}]'
      WHEN 3 THEN '[{"sport":"Futsal","teamSize":5}]'
      WHEN 4 THEN '[{"sport":"Badminton","teamSize":2}]'
      WHEN 5 THEN '[{"sport":"Tennis","teamSize":2},{"sport":"Pickleball","teamSize":4}]'
      WHEN 6 THEN '[{"sport":"Basketball","teamSize":5}]'
      WHEN 7 THEN '[{"sport":"Swimming","teamSize":1}]'
      WHEN 8 THEN '[{"sport":"Futsal","teamSize":5},{"sport":"Box Cricket","teamSize":8}]'
      ELSE sport_config END
    WHERE sport_config IS NULL;
  `);

  // Seed default community posts if none exist
  const commCount = await dbInstance.get('SELECT COUNT(*) as count FROM CommunityPosts');
  if (commCount.count === 0) {
    await dbInstance.exec(`
      INSERT INTO CommunityPosts (post_type, sport, team_name, turf, spots, fare, event_date, event_time, prize_pool, max_teams, status, created_by_name, created_by_phone, created_by_email) VALUES
      ('solo', 'Football', 'Marina Strikers', 'GreenLine Arena', 2, 150, '2026-09-10', '18:00', NULL, 11, 'Open', 'Rahul Kumar', '9876543210', 'rahul@example.com'),
      ('team', 'Cricket', 'Velachery Warriors', 'Boundary Line Turf', 1, 400, '2026-09-12', '19:00', NULL, 8, 'Open', 'Karthik S', '9840123456', 'karthik@example.com'),
      ('tournament', 'Football', 'Chennai Super Cup 2026', 'SkyLine Sports Hub', 16, 499, '2026-09-20', '08:00', 'Winner ₹25,000 + Trophy', 16, 'Registrations Open', 'TurfArena Official', '9999999999', 'admin@turfarena.com');
    `);
    console.log('Seeded database with initial community posts.');
  }

  return dbInstance;
}

function getDB() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return dbInstance;
}

module.exports = { initDB, getDB };
