const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
(async () => {
  const db = await open({ filename: 'turf.db', driver: sqlite3.Database });
  const users = await db.all('SELECT id, name, email, role FROM Users ORDER BY id');
  console.log('CURRENT USERS:');
  console.table(users);
  // Remove only clearly-marked verification-script test users to restore original state
  const testEmails = [
    'wfowner@example.com', 'wfuser@example.com',
    'wfowner.verify@example.com', 'wfuser.verify@example.com',
    'wfowner.clean99@example.com', 'wfuser.clean99@example.com'
  ];
  for (const e of testEmails) {
    const r = await db.run('DELETE FROM Users WHERE email = ?', [e]);
    if (r.changes) console.log('Removed test user:', e);
  }
  const after = await db.all('SELECT id, name, email, role FROM Users ORDER BY id');
  console.log('USERS AFTER CLEANUP:');
  console.table(after);
  const turfs = await db.all('SELECT id, name, owner_id FROM Turfs ORDER BY id');
  console.log('TURFS:');
  console.table(turfs);
  const bookings = await db.get('SELECT COUNT(*) AS n FROM Bookings');
  console.log('Bookings count:', bookings.n);
  await db.close();
})();
