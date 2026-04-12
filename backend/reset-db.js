const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function resetDB() {
  const db = await open({
    filename: path.join(__dirname, 'turf.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    DROP TABLE IF EXISTS TeamOpenings;
    DROP TABLE IF EXISTS TeamRequests;
  `);
  console.log("Dropped tables.");
}

resetDB();
