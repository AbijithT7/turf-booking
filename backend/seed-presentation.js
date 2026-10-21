require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const { initDB } = require('./db');

const KEEP_EMAIL = 'abijitht77@gmail.com';
const DEMO_PASSWORD = 'TurfArena@2026';

async function upsertUser(db, { name, email, phone }) {
  const existing = await db.get('SELECT id FROM Users WHERE LOWER(email) = ?', [email]);
  if (existing) return existing.id;
  const password = await bcrypt.hash(DEMO_PASSWORD, 12);
  const result = await db.run(
    'INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
    [name, email, phone, password, 'user']
  );
  return result.lastID;
}

async function addPost(db, host, post) {
  const result = await db.run(
    `INSERT INTO CommunityPosts
      (user_id, post_type, sport, team_name, turf, spots, fare, event_date, event_time, prize_pool, max_teams, status, created_by_name, created_by_phone, created_by_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [host.id, post.type, post.sport, post.name, post.turf, post.spots, post.fare, post.date, post.time,
      post.prize || null, post.maxTeams || 11, post.status || 'Open', host.name, host.phone, host.email]
  );
  return result.lastID;
}

async function main() {
  const db = await initDB();
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@turfarena.com').toLowerCase();

  await db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    // Remove old presentation activity first so no request is left pointing to a removed user.
    await db.exec(`
      DELETE FROM CommunityRequests;
      DELETE FROM TeamRequests;
      DELETE FROM CommunityPosts;
      DELETE FROM TeamOpenings;
      DELETE FROM Bookings;
      UPDATE Turfs SET owner_id = NULL;
    `);
    await db.run('DELETE FROM Users WHERE LOWER(email) NOT IN (?, ?)', [KEEP_EMAIL, adminEmail]);

    let abijith = await db.get('SELECT id, name, email, phone FROM Users WHERE LOWER(email) = ?', [KEEP_EMAIL]);
    if (!abijith) {
      const id = await upsertUser(db, { name: 'Abijith', email: KEEP_EMAIL, phone: '9000000001' });
      abijith = await db.get('SELECT id, name, email, phone FROM Users WHERE id = ?', [id]);
    }

    const hostRows = [
      { name: 'Arjun Menon', email: 'arjun.host@turfarena.demo', phone: '9000000101' },
      { name: 'Kavya Iyer', email: 'kavya.host@turfarena.demo', phone: '9000000102' },
      { name: 'Rohit Shah', email: 'rohit.host@turfarena.demo', phone: '9000000103' },
      { name: 'Nisha Patel', email: 'nisha.host@turfarena.demo', phone: '9000000104' }
    ];
    const hosts = [];
    for (const host of hostRows) {
      const id = await upsertUser(db, host);
      hosts.push({ ...host, id });
    }

    const soloPost = await addPost(db, hosts[0], {
      type: 'solo', sport: 'Football', name: 'Velachery Night Owls', turf: 'GreenLine Arena',
      spots: 2, fare: 180, date: '2026-10-24', time: '19:00'
    });
    const warPost = await addPost(db, hosts[1], {
      type: 'team', sport: 'Cricket', name: 'Tambaram Thunder', turf: 'Boundary Line Arena',
      spots: 11, fare: 1400, date: '2026-10-25', time: '20:00'
    });
    const tournamentPost = await addPost(db, hosts[2], {
      type: 'tournament', sport: 'Football', name: 'Chennai Weekend Cup', turf: 'SkyLine Rooftop Hub',
      spots: 16, fare: 750, date: '2026-11-01', time: '08:30', prize: 'Winner ₹30,000 + Trophy', maxTeams: 16,
      status: 'Registrations Open'
    });
    await addPost(db, hosts[3], {
      type: 'tournament', sport: 'Cricket', name: 'OMR Box Cricket League', turf: 'Titan Sports Complex',
      spots: 12, fare: 999, date: '2026-11-08', time: '09:00', prize: 'Winner ₹20,000', maxTeams: 12,
      status: 'Registrations Open'
    });

    const opening = await db.run(
      `INSERT INTO TeamOpenings (turf_id, user_id, sport, seats, team_size, fare, creator_phone, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, hosts[0].id, 'Football', 2, 7, 180, hosts[0].phone, hosts[0].name]
    );

    // Abijith is already queued on each main presentation flow; hosts can log in and approve.
    for (const postId of [soloPost, warPost, tournamentPost]) {
      await db.run(
        `INSERT INTO CommunityRequests (post_id, user_id, applicant_name, applicant_phone, applicant_team, applicant_email, status)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
        [postId, abijith.id, abijith.name, abijith.phone, 'Abijith All-Stars', abijith.email]
      );
    }
    await db.run(
      `INSERT INTO TeamRequests (opening_id, user_id, requester_name, requester_phone, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [opening.lastID, abijith.id, abijith.name, abijith.phone]
    );

    await db.exec('COMMIT');
    console.log(`Presentation seed complete. Kept ${KEEP_EMAIL} and ${adminEmail}; created ${hosts.length} demo hosts.`);
    console.log(`Demo-host password: ${DEMO_PASSWORD}`);
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
