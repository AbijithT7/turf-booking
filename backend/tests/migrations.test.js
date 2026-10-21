const path = require('path');
const fs = require('fs');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();

process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin@turfarena.com';
process.env.ADMIN_PASSWORD = 'StrongerAdmin!2026';

const { runMigrations } = require('../migrations');

const DB_FILE = path.join(__dirname, 'test-migrations.db');
try {
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
} catch (e) {}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
  passed++;
}

let passed = 0;
let failed = 0;

async function tableNames(db) {
  const rows = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  return rows.map(r => r.name);
}

async function runTests() {
  console.log('==================================================');
  console.log('TURFARENA MIGRATION IDempotENCY TEST SUITE');
  console.log('==================================================\n');

  // Fresh database: apply all migrations
  const db = await open({ filename: DB_FILE, driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON;');
  await runMigrations(db);

  const tablesAfterFirst = await tableNames(db);
  const expectedTables = ['Users', 'Turfs', 'Bookings', 'BlockedSlots', 'TeamOpenings', 'TeamRequests',
    'CommunityPosts', 'CommunityRequests', '_migrations'];
  for (const t of expectedTables) {
    assert(tablesAfterFirst.includes(t), `Table ${t} exists after first migration`);
  }

  const turfsCols = await db.all('PRAGMA table_info(Turfs)');
  assert(turfsCols.some(c => c.name === 'owner_id'), 'Turfs.owner_id column added by 005 migration');

  const migrationsCount1 = await db.get('SELECT COUNT(*) AS n FROM _migrations');
  assert(migrationsCount1.n === 5, 'Exactly 5 migrations recorded on fresh db');

  // Seed some existing application data to prove preservation
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('password123', 12);
  await db.run("INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)",
    ['Preserved User', 'preserved@example.com', '9500000001', hash, 'user']);
  const user = await db.get('SELECT id FROM Users WHERE email = ?', ['preserved@example.com']);
  await db.run("INSERT INTO Turfs (name, meta, basePrice, panoramaUrl, owner_id) VALUES (?, ?, ?, ?, ?)",
    ['Preserved Turf', 'Chennai', 1000, 'turf.jpg', user.id]);
  const turf = await db.get('SELECT id FROM Turfs WHERE name = ?', ['Preserved Turf']);
  await db.run("INSERT INTO Bookings (turf_id, user_id, user_name, user_phone, sport_type, booking_date, slot_hour) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [turf.id, user.id, 'Preserved User', '9500000001', 'Football', '2026-12-01', 18]);
  const bookingCountBefore = await db.get('SELECT COUNT(*) AS n FROM Bookings');
  const userCountBefore = await db.get('SELECT COUNT(*) AS n FROM Users');

  // Re-run migrations: must be idempotent and preserve data
  await runMigrations(db);
  const tablesAfterSecond = await tableNames(db);
  for (const t of expectedTables) {
    assert(tablesAfterSecond.includes(t), `Table ${t} still exists after re-migration`);
  }
  const migrationsCount2 = await db.get('SELECT COUNT(*) AS n FROM _migrations');
  assert(migrationsCount2.n === 5, 'No duplicate migration records after re-run');
  assert(migrationsCount2.n === migrationsCount1.n, 'Migration record count unchanged after re-run');

  const userCountAfter = await db.get('SELECT COUNT(*) AS n FROM Users');
  const bookingCountAfter = await db.get('SELECT COUNT(*) AS n FROM Bookings');
  const turfCount = await db.get('SELECT COUNT(*) AS n FROM Turfs');
  assert(userCountAfter.n === userCountBefore.n, 'Existing users preserved across re-migration');
  assert(bookingCountAfter.n === bookingCountBefore.n, 'Existing bookings preserved across re-migration');
  assert(turfCount.n >= 1, 'Existing turfs preserved across re-migration');

  const preservedUser = await db.get('SELECT id FROM Users WHERE email = ?', ['preserved@example.com']);
  assert(Boolean(preservedUser), 'Preserved user row still present');
  const preservedBooking = await db.get('SELECT id FROM Bookings WHERE user_id = ?', [preservedUser.id]);
  assert(Boolean(preservedBooking), 'Preserved booking row still present');

  const turfsCols2 = await db.all('PRAGMA table_info(Turfs)');
  assert(turfsCols2.some(c => c.name === 'owner_id'), 'owner_id column still present after re-migration');

  await db.close();

  console.log(`\n==================================================`);
  console.log(`MIGRATION TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');
}

runTests().finally(async () => {
  try {
    if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  } catch (e) {}
  await new Promise((r) => setTimeout(r, 200));
}).catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
