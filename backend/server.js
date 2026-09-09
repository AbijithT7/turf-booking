require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend')));

let db;

// Initialize Database connection and tables
async function initDB() {
  db = await open({
    filename: './turf.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password TEXT NOT NULL,
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
      turf_id INTEGER,
      user_name TEXT,
      user_phone TEXT,
      sport_type TEXT,
      booking_date DATE,
      slot_hour INTEGER
    );
    CREATE TABLE IF NOT EXISTS BlockedSlots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turf_id INTEGER,
      blocked_date DATE,
      slot_hour INTEGER,
      UNIQUE(turf_id, blocked_date, slot_hour)
    );
    CREATE TABLE IF NOT EXISTS TeamOpenings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turf_id INTEGER,
      sport TEXT,
      seats INTEGER,
      team_size INTEGER,
      fare INTEGER,
      creator_phone TEXT,
      creator_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS TeamRequests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opening_id INTEGER,
      requester_name TEXT,
      requester_phone TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS CommunityPosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      post_id INTEGER NOT NULL,
      applicant_name TEXT,
      applicant_phone TEXT,
      applicant_team TEXT,
      applicant_email TEXT,
      upi_ref TEXT,
      status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES CommunityPosts(id) ON DELETE CASCADE
    );
  `);

  // Seed turfs if none exist
  const count = await db.get('SELECT COUNT(*) as count FROM Turfs');
  if (count.count === 0) {
    await db.exec(`
      INSERT INTO Turfs (id, name, meta, basePrice, panoramaUrl) VALUES 
      (1, 'GreenLine Arena', 'Velachery • Football, Cricket', 1200, 'turf1-360.jpg'),
      (2, 'Boundary Line Turf', 'Tambaram • Cricket box', 800, 'turf2-360.jpg'),
      (3, 'SkyLine Sports Hub', 'OMR • Multi-sport', 1000, 'turf3-360.jpg');
    `);
    console.log("Seeded database with initial turf data.");
  }

  // Seed default user if none exist so your friend can log in
  const userCount = await db.get('SELECT COUNT(*) as count FROM Users');
  if (userCount.count === 0) {
    const defaultPassword = await bcrypt.hash('password123', 10);
    await db.run(
      'INSERT INTO Users (name, email, phone, password) VALUES (?, ?, ?, ?)',
      ['Test User', 'test@turf.com', '9999999999', defaultPassword]
    );
    console.log("Seeded default user: test@turf.com / password123");
  }

  // Seed default community posts if none exist
  const commCount = await db.get('SELECT COUNT(*) as count FROM CommunityPosts');
  if (commCount.count === 0) {
    await db.exec(`
      INSERT INTO CommunityPosts (post_type, sport, team_name, turf, spots, fare, event_date, event_time, prize_pool, max_teams, status, created_by_name, created_by_phone, created_by_email) VALUES
      ('solo', 'Football', 'Marina Strikers', 'GreenLine Arena', 2, 150, '2026-09-10', '18:00', NULL, 11, 'Open', 'Rahul Kumar', '9876543210', 'rahul@example.com'),
      ('team', 'Cricket', 'Velachery Warriors', 'Boundary Line Turf', 1, 400, '2026-09-12', '19:00', NULL, 8, 'Open', 'Karthik S', '9840123456', 'karthik@example.com'),
      ('tournament', 'Football', 'Chennai Super Cup 2026', 'SkyLine Sports Hub', 16, 499, '2026-09-20', '08:00', 'Winner ₹25,000 + Trophy', 16, 'Registrations Open', 'TurfArena Official', '9999999999', 'admin@turfarena.com');
    `);
    console.log("Seeded database with initial community posts.");
  }
}

initDB().catch(console.error);

// --- AUTHENTICATION ROUTES ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) return res.status(400).json({ error: 'All fields are required' });

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await db.run(
      'INSERT INTO Users (name, email, phone, password) VALUES (?, ?, ?, ?)',
      [name.trim(), cleanEmail, cleanPhone, hashedPassword]
    );
    
    // Auto-login after registration
    res.json({ message: 'Registration successful', user: { name: name.trim(), email: cleanEmail, phone: cleanPhone } });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const cleanEmail = email.trim().toLowerCase();
    const user = await db.get('SELECT * FROM Users WHERE LOWER(email) = ?', [cleanEmail]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    // Format joinedDate
    const joinedDate = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(user.created_at + "Z"));

    res.json({
      message: 'Login successful',
      user: { name: user.name, email: user.email, phone: user.phone, joinedDate: joinedDate }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API ROUTES ---

app.get('/api/users', async (req, res) => {
  try {
    const rows = await db.all('SELECT id, name, email, phone, created_at FROM Users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const date = req.query.date;
    if (date) {
      const rows = await db.all('SELECT turf_id, slot_hour FROM Bookings WHERE booking_date = ?', [date]);
      const bookings = {};
      rows.forEach(row => {
        if (!bookings[row.turf_id]) bookings[row.turf_id] = [];
        bookings[row.turf_id].push(row.slot_hour);
      });
      return res.json(bookings);
    }

    // Return all bookings for admin dashboard
    const allBookings = await db.all(`
      SELECT b.id, b.turf_id, b.user_name, b.user_phone, b.sport_type, b.booking_date, b.slot_hour, t.name as turf_name, t.basePrice
      FROM Bookings b
      LEFT JOIN Turfs t ON b.turf_id = t.id
      ORDER BY b.booking_date DESC, b.slot_hour DESC
    `);
    res.json(allBookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/turfs', async (req, res) => {
  try {
    const rows = await db.all('SELECT id, name, meta, basePrice, panoramaUrl FROM Turfs');
    const turfData = {};
    rows.forEach(turf => {
      turfData[turf.id] = {
        id: turf.id,
        name: turf.name,
        meta: turf.meta,
        basePrice: turf.basePrice,
        panoramaUrl: turf.panoramaUrl
      };
    });
    res.json(turfData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/user/bookings/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const query = `
      SELECT 
        b.booking_date, 
        b.slot_hour, 
        t.name as turf_name, 
        t.basePrice 
      FROM Bookings b
      JOIN Turfs t ON b.turf_id = t.id
      WHERE b.user_phone = ?
      ORDER BY b.booking_date DESC, b.slot_hour DESC
    `;
    const rows = await db.all(query, [phone]);

    // Format output for frontend
    const history = rows.map(r => {
      // 12 hour format logic
      const h = r.slot_hour;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hr = h % 12 || 12;
      const nextH = (h + 1) % 12 || 12;
      const nextAmpm = (h + 1) >= 12 && (h + 1) < 24 ? 'PM' : 'AM';
      
      const timeStr = `${hr}:00 ${ampm} – ${nextH}:00 ${nextAmpm}`;

      return {
        turf: r.turf_name,
        date: r.booking_date,
        time: timeStr,
        price: "₹" + r.basePrice,
        status: "Confirmed" // For this demo, all booked slots are confirmed
      };
    });

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { turfId, userName, userPhone, sportType, date, selectedSlots } = req.body;

    if (!selectedSlots || selectedSlots.length === 0) {
      return res.status(400).json({ error: 'No slots selected' });
    }

    await db.exec('BEGIN TRANSACTION');
    const stmt = await db.prepare('INSERT INTO Bookings (turf_id, user_name, user_phone, sport_type, booking_date, slot_hour) VALUES (?, ?, ?, ?, ?, ?)');
    
    for (const slot of selectedSlots) {
      await stmt.run([turfId, userName, userPhone, sportType, date, slot]);
    }
    
    await stmt.finalize();
    await db.exec('COMMIT');

    res.json({ message: 'Booking confirmed successfully!' });
  } catch (err) {
    await db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM Bookings WHERE id = ?', [id]);
    res.json({ message: 'Booking deleted successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- ADMIN ROUTES FOR BLOCKED SLOTS ---

app.get('/api/blocked-slots', async (req, res) => {
  try {
    const date = req.query.date;
    const rows = await db.all('SELECT turf_id, slot_hour FROM BlockedSlots WHERE blocked_date = ?', [date]);
    
    const blocked = {};
    rows.forEach(row => {
      if (!blocked[row.turf_id]) blocked[row.turf_id] = [];
      blocked[row.turf_id].push(row.slot_hour);
    });
    res.json(blocked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/blocked-slots', async (req, res) => {
  try {
    const { turfId, date, slotHour } = req.body;
    await db.run('INSERT INTO BlockedSlots (turf_id, blocked_date, slot_hour) VALUES (?, ?, ?)', [turfId, date, slotHour]);
    res.json({ message: 'Slot blocked successfully!' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.json({ message: 'Already blocked' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/blocked-slots', async (req, res) => {
  try {
    const { turfId, date, slotHour } = req.body;
    await db.run('DELETE FROM BlockedSlots WHERE turf_id = ? AND blocked_date = ? AND slot_hour = ?', [turfId, date, slotHour]);
    res.json({ message: 'Slot unblocked successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TEAM OPENINGS ROUTES ---

app.get('/api/openings', async (req, res) => {
  try {
    const rows = await db.all('SELECT id, turf_id, sport, seats, team_size as teamSize, fare, creator_phone, creator_name FROM TeamOpenings ORDER BY created_at DESC');
    
    const openings = {};
    rows.forEach(row => {
      if (!openings[row.turf_id]) openings[row.turf_id] = [];
      openings[row.turf_id].push({
        id: row.id,
        sport: row.sport,
        seats: row.seats,
        teamSize: row.teamSize,
        fare: row.fare,
        creatorPhone: row.creator_phone,
        creatorName: row.creator_name
      });
    });
    res.json(openings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/openings', async (req, res) => {
  try {
    const { turfId, sport, seats, teamSize, fare, creatorPhone, creatorName } = req.body;
    
    if (!creatorPhone || !creatorName) {
      return res.status(400).json({ error: 'You must be logged in to create an opening.' });
    }
    if (teamSize > 11) {
      return res.status(400).json({ error: 'Team size cannot exceed 11 players.' });
    }

    await db.run('INSERT INTO TeamOpenings (turf_id, sport, seats, team_size, fare, creator_phone, creator_name) VALUES (?, ?, ?, ?, ?, ?, ?)', [turfId, sport, seats, teamSize, fare, creatorPhone, creatorName]);
    res.json({ message: 'Team opening posted successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request to join a team
app.post('/api/openings/:id/request', async (req, res) => {
  try {
    const openingId = req.params.id;
    const { requesterName, requesterPhone } = req.body;
    
    if (!requesterName || !requesterPhone) {
      return res.status(400).json({ error: 'You must log in to join.' });
    }
    
    // Prevent duplicate request
    const existing = await db.get('SELECT id FROM TeamRequests WHERE opening_id = ? AND requester_phone = ?', [openingId, requesterPhone]);
    if (existing) {
      return res.status(400).json({ error: 'You have already requested to join this team.' });
    }
    
    // Prevent creator from joining their own team
    const opening = await db.get('SELECT seats, creator_phone FROM TeamOpenings WHERE id = ?', [openingId]);
    if (!opening) return res.status(404).json({ error: 'Opening not found' });
    if (opening.creator_phone === requesterPhone) {
      return res.status(400).json({ error: 'You cannot request to join your own team.' });
    }
    if (opening.seats <= 0) {
      return res.status(400).json({ error: 'This team is already full or no seats are available.' });
    }

    await db.run('INSERT INTO TeamRequests (opening_id, requester_name, requester_phone, status) VALUES (?, ?, ?, ?)', [openingId, requesterName, requesterPhone, 'pending']);
    res.json({ message: 'Join request sent successfully! Wait for approval.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch user's created team openings and associated requests
app.get('/api/user/openings/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const openings = await db.all(`
      SELECT o.id, o.sport, o.seats, o.team_size, o.fare, t.name as turf_name, o.created_at
      FROM TeamOpenings o
      JOIN Turfs t ON o.turf_id = t.id
      WHERE o.creator_phone = ?
      ORDER BY o.created_at DESC
    `, [phone]);
    
    for (let opening of openings) {
      const requests = await db.all('SELECT id, requester_name, requester_phone, status FROM TeamRequests WHERE opening_id = ?', [opening.id]);
      opening.requests = requests || [];
    }

    res.json(openings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Respond to a join request (approve/reject)
app.post('/api/requests/:id/respond', async (req, res) => {
  try {
    const requestId = req.params.id;
    const { action } = req.body; // 'approve' or 'reject'
    
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: 'Invalid action.' });
    }

    const request = await db.get('SELECT opening_id, status FROM TeamRequests WHERE id = ?', [requestId]);
    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is already processed.' });

    await db.exec('BEGIN TRANSACTION');

    if (action === 'approve') {
      const opening = await db.get('SELECT seats FROM TeamOpenings WHERE id = ?', [request.opening_id]);
      if (opening.seats <= 0) {
        await db.exec('ROLLBACK');
        return res.status(400).json({ error: 'No seats available to approve this request.' });
      }
      // Decrement seats and update request status
      await db.run('UPDATE TeamOpenings SET seats = seats - 1 WHERE id = ?', [request.opening_id]);
      await db.run('UPDATE TeamRequests SET status = ? WHERE id = ?', ['approved', requestId]);
    } else {
      await db.run('UPDATE TeamRequests SET status = ? WHERE id = ?', ['rejected', requestId]);
    }

    await db.exec('COMMIT');
    res.json({ message: `Request ${action}d successfully.` });
  } catch (err) {
    await db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// --- COMMUNITY HUB ROUTES ---

// Helper to fetch community posts with nested requests
async function getCommunityPostsList() {
  const posts = await db.all('SELECT * FROM CommunityPosts ORDER BY created_at DESC');
  const result = [];
  for (const p of posts) {
    const requests = await db.all('SELECT * FROM CommunityRequests WHERE post_id = ? ORDER BY created_at ASC', [p.id]);
    result.push({
      id: p.id,
      _id: String(p.id),
      postType: p.post_type,
      sport: p.sport,
      teamName: p.team_name,
      title: p.team_name,
      turf: p.turf || 'GreenLine Arena',
      turfName: p.turf || 'GreenLine Arena',
      spots: p.spots,
      openSpots: p.spots,
      fare: p.fare,
      farePerPlayer: p.fare,
      teamSize: p.max_teams || 11,
      eventDate: p.event_date,
      matchDate: p.event_date,
      eventTime: p.event_time,
      matchTime: p.event_time,
      prizePool: p.prize_pool,
      prize: p.prize_pool,
      maxTeams: p.max_teams,
      status: p.status || 'Open',
      createdByName: p.created_by_name,
      hostName: p.created_by_name,
      createdByPhone: p.created_by_phone,
      hostPhone: p.created_by_phone,
      createdByEmail: p.created_by_email,
      hostEmail: p.created_by_email,
      createdBy: p.created_by_email || p.created_by_phone || p.created_by_name || 'Admin',
      createdAt: p.created_at,
      requests: requests.map(r => ({
        id: r.id,
        _id: String(r.id),
        name: r.applicant_name,
        applicantName: r.applicant_name,
        phone: r.applicant_phone,
        applicantPhone: r.applicant_phone,
        teamName: r.applicant_team,
        notes: r.applicant_team,
        email: r.applicant_email,
        applicantEmail: r.applicant_email,
        upiTransactionId: r.upi_ref,
        status: r.status,
        createdAt: r.created_at
      }))
    });
  }
  return result;
}

const communityRouter = express.Router();

communityRouter.get('/', async (req, res) => {
  try {
    const list = await getCommunityPostsList();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

communityRouter.post('/', async (req, res) => {
  try {
    const {
      postType,
      sport,
      teamName,
      title,
      turf,
      turfName,
      spots,
      openSpots,
      fare,
      farePerPlayer,
      eventDate,
      matchDate,
      eventTime,
      matchTime,
      prizePool,
      prize,
      maxTeams,
      teamSize,
      createdByName,
      hostName,
      createdByPhone,
      hostPhone,
      createdByEmail,
      hostEmail,
      createdBy,
      status
    } = req.body;

    const resolvedName = (teamName || title || '').trim();
    if (!sport || !resolvedName) {
      return res.status(400).json({ error: 'Sport and title/team name are required.' });
    }

    const type = postType || 'solo';
    const postStatus = status || (type === 'tournament' ? 'Registrations Open' : 'Open');
    const authorName = (createdByName || hostName || 'Community Host').trim();
    const authorPhone = (createdByPhone || hostPhone || '').trim();
    const authorEmail = (createdByEmail || hostEmail || createdBy || '').trim();
    const postTurf = (turf || turfName || 'GreenLine Arena').trim();
    const numSpots = spots !== undefined ? parseInt(spots, 10) : (openSpots !== undefined ? parseInt(openSpots, 10) : 1);
    const postFare = fare !== undefined ? parseInt(fare, 10) : (farePerPlayer !== undefined ? parseInt(farePerPlayer, 10) : 0);
    const postMaxTeams = maxTeams !== undefined ? parseInt(maxTeams, 10) : (teamSize !== undefined ? parseInt(teamSize, 10) : 16);
    const postEventDate = eventDate || matchDate || null;
    const postEventTime = eventTime || matchTime || null;
    const postPrize = prizePool || prize || null;

    const result = await db.run(`
      INSERT INTO CommunityPosts (post_type, sport, team_name, turf, spots, fare, event_date, event_time, prize_pool, max_teams, status, created_by_name, created_by_phone, created_by_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      type,
      sport,
      resolvedName,
      postTurf,
      numSpots,
      postFare,
      postEventDate,
      postEventTime,
      postPrize,
      postMaxTeams,
      postStatus,
      authorName,
      authorPhone,
      authorEmail
    ]);

    // Also sync to TeamOpenings if it is a solo opening with turf
    if (type === 'solo') {
      let turfId = 1;
      if (postTurf) {
        const matched = await db.get('SELECT id FROM Turfs WHERE name LIKE ?', [`%${postTurf}%`]);
        if (matched) turfId = matched.id;
      }
      await db.run(`
        INSERT INTO TeamOpenings (turf_id, sport, seats, team_size, fare, creator_phone, creator_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [turfId, sport, numSpots, 11, postFare, authorPhone, authorName]);
    }

    res.json({
      message: 'Community post created successfully!',
      id: result.lastID,
      post: {
        id: result.lastID,
        postType: type,
        sport,
        title: resolvedName,
        teamName: resolvedName
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

communityRouter.delete('/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    await db.run('DELETE FROM CommunityRequests WHERE post_id = ?', [postId]);
    const result = await db.run('DELETE FROM CommunityPosts WHERE id = ?', [postId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ message: 'Community post deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

communityRouter.post('/:id/request', async (req, res) => {
  try {
    const postId = req.params.id;
    const {
      name,
      applicantName: aName,
      phone,
      applicantPhone: aPhone,
      teamName,
      notes,
      email,
      applicantEmail: aEmail,
      upiTransactionId
    } = req.body;

    const applicantName = (name || aName || teamName || '').trim();
    const applicantPhone = (phone || aPhone || '').trim();
    const applicantEmail = (email || aEmail || '').trim();
    const applicantTeam = (teamName || notes || '').trim();

    if (!applicantName || !applicantPhone) {
      return res.status(400).json({ error: 'Name and phone number are required.' });
    }

    const post = await db.get('SELECT * FROM CommunityPosts WHERE id = ?', [postId]);
    if (!post) {
      return res.status(404).json({ error: 'Community post not found.' });
    }

    if (post.created_by_phone && post.created_by_phone === applicantPhone) {
      return res.status(400).json({ error: 'You cannot request to join your own post.' });
    }

    // Check duplicate
    const existing = await db.get(
      'SELECT id FROM CommunityRequests WHERE post_id = ? AND applicant_phone = ?',
      [postId, applicantPhone]
    );
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted a request for this post.' });
    }

    const result = await db.run(`
      INSERT INTO CommunityRequests (post_id, applicant_name, applicant_phone, applicant_team, applicant_email, upi_ref, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `, [postId, applicantName, applicantPhone, applicantTeam, applicantEmail, upiTransactionId || null]);

    res.json({
      message: 'Request submitted successfully!',
      requestId: result.lastID,
      request: {
        id: result.lastID,
        applicantName,
        applicantPhone,
        status: 'Pending'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

communityRouter.patch('/:id/request/:requestId', async (req, res) => {
  try {
    const { id: postId, requestId } = req.params;
    const { status } = req.body; // 'Accepted', 'Rejected', 'Pending'

    if (!status) return res.status(400).json({ error: 'Status is required.' });

    const reqRecord = await db.get('SELECT * FROM CommunityRequests WHERE id = ? AND post_id = ?', [requestId, postId]);
    if (!reqRecord) return res.status(404).json({ error: 'Request not found.' });

    await db.run('UPDATE CommunityRequests SET status = ? WHERE id = ?', [status, requestId]);

    // If accepted and it's a solo post, decrement spots
    if (status === 'Accepted') {
      const post = await db.get('SELECT * FROM CommunityPosts WHERE id = ?', [postId]);
      if (post && post.post_type === 'solo' && post.spots > 0) {
        const newSpots = post.spots - 1;
        const newStatus = newSpots === 0 ? 'Full' : post.status;
        await db.run('UPDATE CommunityPosts SET spots = ?, status = ? WHERE id = ?', [newSpots, newStatus, postId]);
      }
    }

    res.json({ message: `Request status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

communityRouter.delete('/:id/request/:requestId', async (req, res) => {
  try {
    const { id: postId, requestId } = req.params;
    const result = await db.run('DELETE FROM CommunityRequests WHERE id = ? AND post_id = ?', [requestId, postId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json({ message: 'Request removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/community', communityRouter);

// Forward /community for direct API calls or page visits
app.use('/community', (req, res, next) => {
  if (req.method !== 'GET' || req.headers.accept?.includes('application/json') || req.path.includes('/request') || req.path.length > 1) {
    return communityRouter(req, res, next);
  }
  res.sendFile(path.join(__dirname, '../frontend/community.html'));
});

// User community dashboard route
app.get('/api/user/community/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const createdPosts = await db.all('SELECT * FROM CommunityPosts WHERE created_by_phone = ? ORDER BY created_at DESC', [phone]);
    for (const p of createdPosts) {
      p.requests = await db.all('SELECT * FROM CommunityRequests WHERE post_id = ?', [p.id]);
    }
    const appliedRequests = await db.all(`
      SELECT r.id, r.status, r.created_at, r.upi_ref, p.team_name, p.sport, p.turf, p.post_type, p.fare, p.event_date
      FROM CommunityRequests r
      JOIN CommunityPosts p ON r.post_id = p.id
      WHERE r.applicant_phone = ?
      ORDER BY r.created_at DESC
    `, [phone]);

    res.json({
      createdPosts,
      appliedRequests,
      posts: createdPosts,
      requests: appliedRequests
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Friendly aliases for pages
app.get('/community.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/community.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-login.html'));
});
app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-dashboard.html'));
});
app.get('/user-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/user-dashboard.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`SQLite Backend Server is running on port ${PORT}`);
});