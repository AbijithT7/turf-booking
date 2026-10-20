const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function resetDB() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run reset-db.js in production.');
  }
  if (process.env.CONFIRM_RESET_DB !== '1') {
    throw new Error('This deletes TeamRequests and TeamOpenings. Set CONFIRM_RESET_DB=1 to confirm.');
  }

  const db = await open({
    filename: path.join(__dirname, 'turf.db'),
    driver: sqlite3.Database
  });

  try {
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec('BEGIN IMMEDIATE TRANSACTION;');
    await db.exec('DROP TABLE IF EXISTS TeamRequests; DROP TABLE IF EXISTS TeamOpenings;');
    await db.exec('COMMIT;');
    console.log('Dropped TeamRequests and TeamOpenings. Other application data was preserved.');
  } catch (err) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  } finally {
    await db.close();
  }
}

resetDB().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
