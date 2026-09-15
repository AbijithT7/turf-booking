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
  if (count.count === 0) {
    await dbInstance.exec(`
      INSERT INTO Turfs (id, name, meta, basePrice, panoramaUrl) VALUES 
      (1, 'GreenLine Arena', 'Velachery • Football, Cricket', 1200, 'turf1-360.jpg'),
      (2, 'Boundary Line Turf', 'Tambaram • Cricket box', 800, 'turf2-360.jpg'),
      (3, 'SkyLine Sports Hub', 'OMR • Multi-sport', 1000, 'turf3-360.jpg');
    `);
    console.log('Seeded database with initial turf data.');
  }

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
