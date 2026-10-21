const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

async function resetAdmin() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run reset-admin.js in production. Set ADMIN_EMAIL/ADMIN_PASSWORD and redeploy instead.');
  }

  const adminEmail = process.env.ADMIN_EMAIL ? String(process.env.ADMIN_EMAIL).trim().toLowerCase() : null;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables before resetting the admin account.');
  }

  const db = await open({
    filename: path.join(__dirname, 'turf.db'),
    driver: sqlite3.Database
  });

  try {
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec('BEGIN IMMEDIATE TRANSACTION;');

    const existing = await db.get('SELECT id, role FROM Users WHERE LOWER(email) = ?', [adminEmail]);

    if (!existing) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await db.run(
        'INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
        ['TurfArena Admin', adminEmail, '9999999999', hash, 'admin']
      );
      console.log(`Provisioned admin account: ${adminEmail}`);
    } else if (existing.role !== 'admin') {
      await db.exec('ROLLBACK;');
      throw new Error(`${adminEmail} belongs to a non-admin account. Refusing automatic role promotion; promote the account manually via /api/admin/users/:id/role.`);
    } else {
      const hash = await bcrypt.hash(adminPassword, 12);
      await db.run('UPDATE Users SET password = ? WHERE id = ?', [hash, existing.id]);
      console.log(`Reset admin password for: ${adminEmail}`);
    }

    await db.exec('COMMIT;');
  } catch (err) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  } finally {
    await db.close();
  }
}

resetAdmin().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
