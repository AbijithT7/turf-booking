require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initDB, getDB } = require('./db');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const {
  validateRegister,
  validateLogin,
  validateBooking,
  validateBlockedSlot,
  validateOpening,
  validateCommunityPost,
  isValidId,
  isValidDate
} = require('./middleware/validate');

// Production Session Secret Validation
if (process.env.NODE_ENV === 'production') {
  if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    process.env.SESSION_SECRET.includes('default_development_secret')
  ) {
    console.error('FATAL: In production, SESSION_SECRET must be set to a secure string of at least 32 characters.');
    process.exit(1);
  }
}

const app = express();

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

// Concurrency Lock for SQLite serialized transactions.
// One shared SQLite connection is used, so API/community requests are serialized
// to prevent statements from one async transaction running inside another.
class AsyncLock {
  constructor() {
    this._queue = Promise.resolve();
  }
  acquire() {
    let release;
    const p = new Promise((resolve) => { release = resolve; });
    const wait = this._queue.then(() => release);
    this._queue = this._queue.then(() => p);
    return wait;
  }
}
const bookingLock = new AsyncLock();

function parseSportConfig(value) {
  try {
    const config = JSON.parse(value || '[]');
    return Array.isArray(config) ? config.filter((entry) =>
      entry && typeof entry.sport === 'string' && Number.isInteger(Number(entry.teamSize))
    ).map((entry) => ({ sport: entry.sport, teamSize: Number(entry.teamSize) })) : [];
  } catch (_) {
    return [];
  }
}

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows local and cdn scripts, fonts, and inline styles used by app
    crossOriginEmbedderPolicy: false
  })
);

// Controlled CORS & Allowed Origins
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5000';
const ALLOWED_ORIGIN_SET = new Set([
  FRONTEND_ORIGIN.replace(/\/$/, ''),
  'http://127.0.0.1:5000',
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGIN_SET.has(origin.replace(/\/$/, ''))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);

// CSRF Defense Middleware for state-changing requests
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Reject cross-site requests signaled by modern browsers
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') {
    return res.status(403).json({ error: 'Cross-origin request blocked by CSRF protection.' });
  }

  // If origin is present, check against allowed list
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGIN_SET.has(origin.replace(/\/$/, ''))) {
    return res.status(403).json({ error: 'Origin not permitted by CSRF protection.' });
  }

  next();
});

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '32kb' }));

// Server-side Session Management with SQLite Store
app.use(
  session({
    store: new SQLiteStore({
      db: process.env.SESSION_DB_NAME || 'sessions.db',
      dir: process.env.SESSION_DB_DIR || __dirname
    }),
    secret: process.env.SESSION_SECRET || 'turfarena_default_development_secret_do_not_use_in_prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  })
);

// This app uses one shared SQLite connection. Serialize API/community requests so
// statements from one async transaction cannot accidentally run inside another.
function serializeDatabaseRequests(req, res, next) {
  bookingLock.acquire().then((release) => {
    let released = false;
    const unlock = () => {
      if (released) return;
      released = true;
      release();
    };
    res.once('finish', unlock);
    res.once('close', unlock);
    next();
  }).catch(next);
}

app.use('/api', serializeDatabaseRequests);
app.use('/community', serializeDatabaseRequests);

// Rate limiters. Login has a stricter limit to slow password guessing;
// registration has a separate cap to reduce automated account creation.
const isTest = process.env.NODE_ENV === 'test';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 2000 : 100,
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 2000 : 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 2000 : 20,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/favicon.ico'));
});

// Helper: format joinedDate
function formatJoinedDate(createdAt) {
  try {
    const d = createdAt ? new Date(createdAt.endsWith('Z') ? createdAt : createdAt + 'Z') : new Date();
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d);
  } catch (e) {
    return 'Recent';
  }
}

// ───────────────────────────────────────────
// AUTHENTICATION ROUTES (Phase 2 & 3)
// ───────────────────────────────────────────

app.post('/api/auth/register', authLimiter, registrationLimiter, validateRegister, async (req, res, next) => {
  try {
    const db = getDB();
    const { name, email, phone, password } = req.body;

    const existing = await db.get('SELECT id FROM Users WHERE LOWER(email) = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone, hashedPassword, 'user']
    );

    const user = await db.get('SELECT id, name, email, phone, role, created_at FROM Users WHERE id = ?', [result.lastID]);

    // Rotate session ID to prevent session fixation.
    await regenerateSession(req);
    req.session.userId = user.id;

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        joinedDate: formatJoinedDate(user.created_at)
      }
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/login', authLimiter, loginLimiter, validateLogin, async (req, res, next) => {
  try {
    const db = getDB();
    const { email, password } = req.body;

    const user = await db.get('SELECT * FROM Users WHERE LOWER(email) = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Rotate session ID to prevent session fixation.
    await regenerateSession(req);
    req.session.userId = user.id;

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        joinedDate: formatJoinedDate(user.created_at)
      }
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out of session.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    const db = getDB();
    const user = await db.get(
      'SELECT id, name, email, phone, role, created_at FROM Users WHERE id = ?',
      [req.session.userId]
    );

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        joinedDate: formatJoinedDate(user.created_at)
      }
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────
// USERS & TURFS ROUTES
// ───────────────────────────────────────────

// Admin endpoint: List all users
app.get('/api/users', requireAdmin, async (req, res, next) => {
  try {
    const db = getDB();
    const rows = await db.all(
      'SELECT id, name, email, phone, role, created_at FROM Users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────
// TURF OWNER FOUNDATION
// ───────────────────────────────────────────

async function requireTurfOwnerOrAdmin(req, res, turfId) {
  const db = getDB();
  const turf = await db.get('SELECT id, owner_id FROM Turfs WHERE id = ?', [turfId]);
  if (!turf) {
    res.status(404).json({ error: 'Turf not found.' });
    return null;
  }
  if (req.user.role !== 'admin' && !(req.user.role === 'owner' && Number(turf.owner_id) === Number(req.user.id))) {
    res.status(403).json({ error: 'You do not manage this turf.' });
    return null;
  }
  return turf;
}

// Admin assigns an existing account the owner role. Role changes are never self-service.
app.patch('/api/admin/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid user ID.' });
    const role = req.body && req.body.role;
    if (!['user', 'owner'].includes(role)) {
      return res.status(400).json({ error: 'Role must be user or owner.' });
    }
    const db = getDB();
    const target = await db.get('SELECT id, role FROM Users WHERE id = ?', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.role === 'admin') return res.status(400).json({ error: 'Admin role cannot be changed through this endpoint.' });
    await db.run('UPDATE Users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'User role updated.', userId: Number(req.params.id), role });
  } catch (err) { next(err); }
});

// Admin assigns or unassigns a turf to an account already promoted to owner.
app.patch('/api/admin/turfs/:id/owner', requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid turf ID.' });
    const ownerId = req.body && req.body.ownerId;
    const db = getDB();
    const turf = await db.get('SELECT id FROM Turfs WHERE id = ?', [req.params.id]);
    if (!turf) return res.status(404).json({ error: 'Turf not found.' });
    if (ownerId !== null && ownerId !== undefined && ownerId !== '') {
      if (!isValidId(ownerId)) return res.status(400).json({ error: 'ownerId must be a valid user ID or null.' });
      const owner = await db.get('SELECT id, role FROM Users WHERE id = ?', [ownerId]);
      if (!owner || owner.role !== 'owner') return res.status(400).json({ error: 'Assign the owner role to this account first.' });
      await db.run('UPDATE Turfs SET owner_id = ? WHERE id = ?', [Number(ownerId), req.params.id]);
    } else {
      await db.run('UPDATE Turfs SET owner_id = NULL WHERE id = ?', [req.params.id]);
    }
    res.json({ message: 'Turf ownership updated.' });
  } catch (err) { next(err); }
});

// Admin view of owner accounts and their assigned facilities.
app.get('/api/admin/owners', requireAdmin, async (req, res, next) => {
  try {
    const rows = await getDB().all(`
      SELECT u.id, u.name, u.email, u.phone, COUNT(t.id) AS turf_count
      FROM Users u LEFT JOIN Turfs t ON t.owner_id = u.id
      WHERE u.role = 'owner'
      GROUP BY u.id ORDER BY u.name COLLATE NOCASE
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// Owner dashboard data is scoped by the authenticated owner ID.
app.get('/api/owner/turfs', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Turf owner access required.' });
    }
    const db = getDB();
    let turfRows;
    if (req.user.role === 'admin' && req.query.ownerId) {
      turfRows = await db.all(
        'SELECT id, name, meta, basePrice, panoramaUrl, sport_config FROM Turfs WHERE owner_id = ? ORDER BY name',
        [req.query.ownerId]
      );
    } else if (req.user.role === 'admin') {
      turfRows = await db.all('SELECT id, name, meta, basePrice, panoramaUrl, sport_config FROM Turfs ORDER BY name');
    } else {
      turfRows = await db.all(
        'SELECT id, name, meta, basePrice, panoramaUrl, sport_config FROM Turfs WHERE owner_id = ? ORDER BY name',
        [req.user.id]
      );
    }
    res.json(turfRows);
  } catch (err) { next(err); }
});

app.get('/api/owner/bookings', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Turf owner access required.' });
    }
    const db = getDB();
    let bookingRows;
    if (req.user.role === 'admin' && req.query.ownerId) {
      bookingRows = await db.all(`
        SELECT b.id, b.turf_id, t.name AS turf_name, b.booking_date, b.slot_hour,
               b.sport_type, b.user_name, b.user_phone, t.basePrice
        FROM Bookings b JOIN Turfs t ON t.id = b.turf_id
        WHERE t.owner_id = ?
        ORDER BY b.booking_date DESC, b.slot_hour DESC
      `, [req.query.ownerId]);
    } else if (req.user.role === 'admin') {
      bookingRows = await db.all(`
        SELECT b.id, b.turf_id, t.name AS turf_name, b.booking_date, b.slot_hour,
               b.sport_type, b.user_name, b.user_phone, t.basePrice
        FROM Bookings b JOIN Turfs t ON t.id = b.turf_id
        ORDER BY b.booking_date DESC, b.slot_hour DESC
      `);
    } else {
      bookingRows = await db.all(`
        SELECT b.id, b.turf_id, t.name AS turf_name, b.booking_date, b.slot_hour,
               b.sport_type, b.user_name, b.user_phone, t.basePrice
        FROM Bookings b JOIN Turfs t ON t.id = b.turf_id
        WHERE t.owner_id = ?
        ORDER BY b.booking_date DESC, b.slot_hour DESC
      `, [req.user.id]);
    }
    res.json(bookingRows);
  } catch (err) { next(err); }
});

// Owner pricing is validated and only affects turfs assigned to that owner.
app.patch('/api/owner/turfs/:id/price', requireAuth, async (req, res, next) => {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Turf owner access required.' });
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid turf ID.' });
    const price = Number(req.body && req.body.basePrice);
    if (!Number.isInteger(price) || price < 100 || price > 100000) {
      return res.status(400).json({ error: 'Hourly price must be an integer between ₹100 and ₹100,000.' });
    }
    const turf = await requireTurfOwnerOrAdmin(req, res, req.params.id);
    if (!turf) return;
    await getDB().run('UPDATE Turfs SET basePrice = ? WHERE id = ?', [price, req.params.id]);
    res.json({ message: 'Hourly price updated.', turfId: Number(req.params.id), basePrice: price });
  } catch (err) { next(err); }
});

app.patch('/api/owner/turfs/:id/sports', requireAuth, async (req, res, next) => {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Turf owner access required.' });
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid turf ID.' });
    const turf = await requireTurfOwnerOrAdmin(req, res, req.params.id);
    if (!turf) return;
    const config = req.body && req.body.sportConfig;
    if (!Array.isArray(config) || config.length < 1 || config.length > 10) {
      return res.status(400).json({ error: 'Add between 1 and 10 supported sports.' });
    }
    const normalised = config.map((entry) => ({
      sport: typeof entry.sport === 'string' ? entry.sport.trim() : '',
      teamSize: Number(entry.teamSize)
    }));
    if (normalised.some((entry) => !entry.sport || entry.sport.length > 40 || !Number.isInteger(entry.teamSize) || entry.teamSize < 1 || entry.teamSize > 50)) {
      return res.status(400).json({ error: 'Each sport needs a name and a team size from 1 to 50.' });
    }
    if (new Set(normalised.map((entry) => entry.sport.toLowerCase())).size !== normalised.length) {
      return res.status(400).json({ error: 'Each supported sport can be listed only once.' });
    }
    await getDB().run('UPDATE Turfs SET sport_config = ? WHERE id = ?', [JSON.stringify(normalised), req.params.id]);
    res.json({ message: 'Supported sports updated.', turfId: Number(req.params.id), sportConfig: normalised });
  } catch (err) { next(err); }
});

// Owner-scoped slot blocks; the existing global admin endpoints remain unchanged.
app.post('/api/owner/blocked-slots', requireAuth, validateBlockedSlot, async (req, res, next) => {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Turf owner access required.' });
    const { turfId, date, slotHour } = req.body;
    const turf = await requireTurfOwnerOrAdmin(req, res, turfId);
    if (!turf) return;
    const db = getDB();
    const existingBooking = await db.get(
      'SELECT id FROM Bookings WHERE turf_id = ? AND booking_date = ? AND slot_hour = ?',
      [turfId, date, slotHour]
    );
    if (existingBooking) return res.status(409).json({ error: 'This slot already has a booking and cannot be blocked.' });
    await db.run('INSERT OR IGNORE INTO BlockedSlots (turf_id, blocked_date, slot_hour) VALUES (?, ?, ?)', [turfId, date, slotHour]);
    res.status(201).json({ message: 'Slot blocked successfully.' });
  } catch (err) { next(err); }
});

app.delete('/api/owner/blocked-slots', requireAuth, validateBlockedSlot, async (req, res, next) => {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Turf owner access required.' });
    const { turfId, date, slotHour } = req.body;
    const turf = await requireTurfOwnerOrAdmin(req, res, turfId);
    if (!turf) return;
    const result = await getDB().run(
      'DELETE FROM BlockedSlots WHERE turf_id = ? AND blocked_date = ? AND slot_hour = ?',
      [turfId, date, slotHour]
    );
    if (!result.changes) return res.status(404).json({ error: 'Blocked slot not found.' });
    res.json({ message: 'Slot unblocked successfully.' });
  } catch (err) { next(err); }
});

// Public: List all turfs
app.get('/api/turfs', async (req, res, next) => {
  try {
    const db = getDB();
    const rows = await db.all('SELECT id, name, meta, basePrice, panoramaUrl, sport_config FROM Turfs');
    const turfData = {};
    rows.forEach((turf) => {
      turfData[turf.id] = {
        id: turf.id,
        name: turf.name,
        meta: turf.meta,
        basePrice: turf.basePrice,
        panoramaUrl: turf.panoramaUrl,
        sportConfig: parseSportConfig(turf.sport_config)
      };
    });
    res.json(turfData);
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────
// BOOKINGS ROUTES (Phases 5, 6, 7)
// ───────────────────────────────────────────

// GET /api/bookings
// If ?date=YYYY-MM-DD: public availability matrix { [turfId]: [slotHours] }
// If no date query: full bookings list, requires admin authorization!
app.get('/api/bookings', async (req, res, next) => {
  try {
    const db = getDB();
    const date = req.query.date;

    if (date) {
      if (!isValidDate(date)) {
        return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
      }
      const rows = await db.all('SELECT turf_id, slot_hour FROM Bookings WHERE booking_date = ?', [date]);
      const bookings = {};
      rows.forEach((row) => {
        if (!bookings[row.turf_id]) bookings[row.turf_id] = [];
        bookings[row.turf_id].push(row.slot_hour);
      });
      return res.json(bookings);
    }

    // No date query -> Admin dashboard list of all bookings
    await requireAdmin(req, res, async () => {
      const allBookings = await db.all(`
        SELECT b.id, b.turf_id, b.user_id, b.user_name, b.user_phone, b.sport_type, b.booking_date, b.slot_hour,
               t.name as turf_name, t.basePrice
        FROM Bookings b
        LEFT JOIN Turfs t ON b.turf_id = t.id
        ORDER BY b.booking_date DESC, b.slot_hour DESC
      `);
      res.json(allBookings);
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings (Requires Authenticated Session)
app.post('/api/bookings', requireAuth, validateBooking, async (req, res, next) => {
  const db = getDB();
  const { turfId, date, selectedSlots, sportType } = req.body;
  const userId = req.session.userId;
  const user = req.user;

  try {
    // Verify turf exists and get basePrice
    const turf = await db.get('SELECT id, name, basePrice FROM Turfs WHERE id = ?', [turfId]);
    if (!turf) {
      return res.status(404).json({ error: 'Turf not found.' });
    }

    await db.exec('BEGIN TRANSACTION');

    const placeholders = selectedSlots.map(() => '?').join(',');

    // Check for blocked slots
    const blockedRows = await db.all(
      `SELECT slot_hour FROM BlockedSlots WHERE turf_id = ? AND blocked_date = ? AND slot_hour IN (${placeholders})`,
      [turfId, date, ...selectedSlots]
    );

    if (blockedRows.length > 0) {
      await db.exec('ROLLBACK');
      const blockedHours = blockedRows.map((r) => r.slot_hour).join(', ');
      return res.status(409).json({
        error: `Slot(s) ${blockedHours} are blocked by facility management.`
      });
    }

    // Check for existing bookings
    const bookedRows = await db.all(
      `SELECT slot_hour FROM Bookings WHERE turf_id = ? AND booking_date = ? AND slot_hour IN (${placeholders})`,
      [turfId, date, ...selectedSlots]
    );

    if (bookedRows.length > 0) {
      await db.exec('ROLLBACK');
      const bookedHours = bookedRows.map((r) => r.slot_hour).join(', ');
      return res.status(409).json({
        error: `Slot(s) ${bookedHours} have already been booked by another user.`
      });
    }

    // Insert bookings with verified user identity
    const stmt = await db.prepare(
      'INSERT INTO Bookings (turf_id, user_id, user_name, user_phone, sport_type, booking_date, slot_hour) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (const slot of selectedSlots) {
      await stmt.run([turfId, userId, user.name, user.phone, sportType, date, slot]);
    }

    await stmt.finalize();
    await db.exec('COMMIT');

    const totalPrice = turf.basePrice * selectedSlots.length;

    res.status(201).json({
      message: 'Booking confirmed successfully!',
      booking: {
        turfId,
        turfName: turf.name,
        date,
        selectedSlots,
        totalPrice
      }
    });
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (rbErr) {}

    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'One or more requested slots are already booked.' });
    }
    next(err);
  }
});

// Helper for formatting booking list response
function formatBookingRecords(rows) {
  return rows.map((r) => {
    const h = r.slot_hour;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    const nextH = (h + 1) % 12 || 12;
    const nextAmpm = (h + 1) >= 12 && (h + 1) < 24 ? 'PM' : 'AM';
    const timeStr = `${hr}:00 ${ampm} – ${nextH}:00 ${nextAmpm}`;

    return {
      id: r.id,
      turf: r.turf_name,
      turfId: r.turf_id,
      date: r.booking_date,
      time: timeStr,
      slotHour: r.slot_hour,
      sport: r.sport_type,
      price: '₹' + r.basePrice,
      status: 'Confirmed'
    };
  });
}

// GET /api/user/bookings (Phase 6: Session-based booking ownership)
app.get('/api/user/bookings', requireAuth, async (req, res, next) => {
  try {
    const db = getDB();
    const rows = await db.all(
      `SELECT b.id, b.turf_id, b.booking_date, b.slot_hour, b.sport_type, t.name as turf_name, t.basePrice 
       FROM Bookings b
       JOIN Turfs t ON b.turf_id = t.id
       WHERE b.user_id = ?
       ORDER BY b.booking_date DESC, b.slot_hour DESC`,
      [req.user.id]
    );

    res.json(formatBookingRecords(rows));
  } catch (err) {
    next(err);
  }
});

// GET /api/user/bookings/:phone (Legacy endpoint with strict ownership check)
app.get('/api/user/bookings/:phone', requireAuth, async (req, res, next) => {
  try {
    const phone = req.params.phone;
    if (req.user.role !== 'admin' && req.user.phone !== phone) {
      return res.status(403).json({ error: 'Forbidden. You may only view your own bookings.' });
    }

    const db = getDB();
    const rows = await db.all(
      `SELECT b.id, b.turf_id, b.booking_date, b.slot_hour, b.sport_type, t.name as turf_name, t.basePrice 
       FROM Bookings b
       JOIN Turfs t ON b.turf_id = t.id
       WHERE b.user_id = ? OR (b.user_phone = ? AND b.user_id = ?)
       ORDER BY b.booking_date DESC, b.slot_hour DESC`,
      [req.user.id, phone, req.user.id]
    );

    res.json(formatBookingRecords(rows));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bookings/:id (Owner or Admin deletion)
app.delete('/api/bookings/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'Invalid booking ID.' });
    }

    const db = getDB();
    const booking = await db.get('SELECT * FROM Bookings WHERE id = ?', [id]);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const turf = await db.get('SELECT owner_id FROM Turfs WHERE id = ?', [booking.turf_id]);
    const isTurfOwner = req.user.role === 'owner' && turf && Number(turf.owner_id) === Number(req.user.id);

    // Normal user may only delete their own booking.
    // Admin may delete any booking. Owner may delete bookings on their own turfs only.
    if (booking.user_id !== req.user.id && req.user.role !== 'admin' && !isTurfOwner) {
      return res.status(403).json({ error: 'Forbidden. You do not own this booking.' });
    }

    await db.run('DELETE FROM Bookings WHERE id = ?', [id]);
    res.json({ message: 'Booking deleted successfully!' });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────
// BLOCKED SLOTS ROUTES (Phase 7 & 8)
// ───────────────────────────────────────────

// Public: Get blocked slots by date
app.get('/api/blocked-slots', async (req, res, next) => {
  try {
    const db = getDB();
    const date = req.query.date;

    if (date) {
      if (!isValidDate(date)) {
        return res.status(400).json({ error: 'Invalid date format.' });
      }
      const rows = await db.all('SELECT turf_id, slot_hour FROM BlockedSlots WHERE blocked_date = ?', [date]);
      const blocked = {};
      rows.forEach((row) => {
        if (!blocked[row.turf_id]) blocked[row.turf_id] = [];
        blocked[row.turf_id].push(row.slot_hour);
      });
      return res.json(blocked);
    }

    // If no date query, only admin can list all blocked slots
    await requireAdmin(req, res, async () => {
      const rows = await db.all('SELECT * FROM BlockedSlots ORDER BY blocked_date DESC, slot_hour ASC');
      res.json(rows);
    });
  } catch (err) {
    next(err);
  }
});

// Admin only: Block a slot
app.post('/api/blocked-slots', requireAdmin, validateBlockedSlot, async (req, res, next) => {
  try {
    const db = getDB();
    const { turfId, date, slotHour } = req.body;

    const turf = await db.get('SELECT id FROM Turfs WHERE id = ?', [turfId]);
    if (!turf) {
      return res.status(404).json({ error: 'Turf not found.' });
    }

    const existingBooking = await db.get(
        'SELECT id FROM Bookings WHERE turf_id = ? AND booking_date = ? AND slot_hour = ?',
        [turfId, date, slotHour]
      );
      if (existingBooking) {
        return res.status(409).json({ error: 'This slot already has a booking and cannot be blocked.' });
      }

    await db.run(
      'INSERT INTO BlockedSlots (turf_id, blocked_date, slot_hour) VALUES (?, ?, ?)',
      [turfId, date, slotHour]
    );
    res.status(201).json({ message: 'Slot blocked successfully!' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.json({ message: 'Already blocked' });
    }
    next(err);
  }
});

// Admin only: Unblock a slot
app.delete('/api/blocked-slots', requireAdmin, validateBlockedSlot, async (req, res, next) => {
  try {
    const db = getDB();
    const { turfId, date, slotHour } = req.body;

    const result = await db.run(
      'DELETE FROM BlockedSlots WHERE turf_id = ? AND blocked_date = ? AND slot_hour = ?',
      [turfId, date, slotHour]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Blocked slot not found.' });
    }

    res.json({ message: 'Slot unblocked successfully!' });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────
// TEAM OPENINGS ROUTES (Phase 9)
// ───────────────────────────────────────────

// Public: Get all team openings
app.get('/api/openings', async (req, res, next) => {
  try {
    const db = getDB();
    const rows = await db.all(`
      SELECT id, turf_id, sport, seats, team_size as teamSize, fare, creator_name, user_id
      FROM TeamOpenings 
      ORDER BY created_at DESC
    `);

    const openings = {};
    rows.forEach((row) => {
      if (!openings[row.turf_id]) openings[row.turf_id] = [];
      openings[row.turf_id].push({
        id: row.id,
        turfId: row.turf_id,
        userId: row.user_id,
        sport: row.sport,
        seats: row.seats,
        teamSize: row.teamSize,
        fare: row.fare,
        creatorName: row.creator_name
      });
    });
    res.json(openings);
  } catch (err) {
    next(err);
  }
});

// Create opening (Requires Auth, uses session for user identity)
app.post('/api/openings', requireAuth, validateOpening, async (req, res, next) => {
  try {
    const db = getDB();
    const { turfId, sport, seats, teamSize, fare } = req.body;
    const user = req.user;

    const turf = await db.get('SELECT id, sport_config FROM Turfs WHERE id = ?', [turfId]);
    if (!turf) {
      return res.status(404).json({ error: 'Turf not found.' });
    }
    const sportRule = parseSportConfig(turf.sport_config).find((entry) => entry.sport.toLowerCase() === sport.toLowerCase());
    if (!sportRule) return res.status(400).json({ error: `${sport} is not available at this turf.` });
    if (teamSize !== sportRule.teamSize) return res.status(400).json({ error: `${sport} openings at this turf must use ${sportRule.teamSize} players per team.` });

    const result = await db.run(
      'INSERT INTO TeamOpenings (turf_id, user_id, sport, seats, team_size, fare, creator_phone, creator_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [turfId, user.id, sport, seats, teamSize, fare, user.phone, user.name]
    );

    res.status(201).json({
      message: 'Team opening posted successfully!',
      id: result.lastID
    });
  } catch (err) {
    next(err);
  }
});

// Request to join a team opening (Requires Auth)
app.post('/api/openings/:id/request', requireAuth, async (req, res, next) => {
  try {
    const openingId = req.params.id;
    if (!isValidId(openingId)) {
      return res.status(400).json({ error: 'Invalid opening ID.' });
    }

    const db = getDB();
    const opening = await db.get('SELECT * FROM TeamOpenings WHERE id = ?', [openingId]);
    if (!opening) {
      return res.status(404).json({ error: 'Opening not found' });
    }

    // Disallow joining own team
    if (opening.user_id === req.user.id || opening.creator_phone === req.user.phone) {
      return res.status(400).json({ error: 'You cannot request to join your own team.' });
    }

    if (opening.seats <= 0) {
      return res.status(400).json({ error: 'This team is already full or no seats are available.' });
    }

    // Prevent duplicate requests
    const existing = await db.get(
      'SELECT id FROM TeamRequests WHERE opening_id = ? AND (user_id = ? OR requester_phone = ?)',
      [openingId, req.user.id, req.user.phone]
    );
    if (existing) {
      return res.status(400).json({ error: 'You have already requested to join this team.' });
    }

    await db.run(
      'INSERT INTO TeamRequests (opening_id, user_id, requester_name, requester_phone, status) VALUES (?, ?, ?, ?, ?)',
      [openingId, req.user.id, req.user.name, req.user.phone, 'pending']
    );

    res.json({ message: 'Join request sent successfully! Wait for approval.' });
  } catch (err) {
    next(err);
  }
});

// Get user's created openings (Session based)
app.get('/api/user/openings', requireAuth, async (req, res, next) => {
  try {
    const db = getDB();
    const openings = await db.all(
      `SELECT o.id, o.sport, o.seats, o.team_size, o.fare, t.name as turf_name, o.created_at
       FROM TeamOpenings o
       JOIN Turfs t ON o.turf_id = t.id
       WHERE o.user_id = ? OR o.creator_phone = ?
       ORDER BY o.created_at DESC`,
      [req.user.id, req.user.phone]
    );

    for (let opening of openings) {
      const requests = await db.all(
        'SELECT id, requester_name, requester_phone, status FROM TeamRequests WHERE opening_id = ?',
        [opening.id]
      );
      opening.requests = requests || [];
    }

    res.json(openings);
  } catch (err) {
    next(err);
  }
});

// Legacy user openings by phone (Requires ownership or admin)
app.get('/api/user/openings/:phone', requireAuth, async (req, res, next) => {
  try {
    const phone = req.params.phone;
    if (req.user.role !== 'admin' && req.user.phone !== phone) {
      return res.status(403).json({ error: 'Forbidden. You may only access your own team openings.' });
    }

    const db = getDB();
    const openings = await db.all(
      `SELECT o.id, o.sport, o.seats, o.team_size, o.fare, t.name as turf_name, o.created_at
       FROM TeamOpenings o
       JOIN Turfs t ON o.turf_id = t.id
       WHERE o.user_id = ? OR o.creator_phone = ?
       ORDER BY o.created_at DESC`,
      [req.user.id, phone]
    );

    for (let opening of openings) {
      const requests = await db.all(
        'SELECT id, requester_name, requester_phone, status FROM TeamRequests WHERE opening_id = ?',
        [opening.id]
      );
      opening.requests = requests || [];
    }

    res.json(openings);
  } catch (err) {
    next(err);
  }
});

// Delete team opening (Owner or Admin only)
app.delete('/api/openings/:id', requireAuth, async (req, res, next) => {
  try {
    const openingId = req.params.id;
    if (!isValidId(openingId)) {
      return res.status(400).json({ error: 'Invalid opening ID.' });
    }

    const db = getDB();
    const opening = await db.get('SELECT * FROM TeamOpenings WHERE id = ?', [openingId]);
    if (!opening) {
      return res.status(404).json({ error: 'Opening not found' });
    }

    const isOwner =
      opening.user_id === req.user.id ||
      opening.creator_phone === req.user.phone ||
      req.user.role === 'admin';

    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to delete this opening.' });
    }

    await db.run('DELETE FROM TeamRequests WHERE opening_id = ?', [openingId]);
    await db.run('DELETE FROM TeamOpenings WHERE id = ?', [openingId]);

    res.json({ message: 'Team opening deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// Respond to join request (Approve / Reject - Owner or Admin only)
app.post('/api/requests/:id/respond', requireAuth, async (req, res, next) => {
  const db = getDB();
  try {
    const requestId = req.params.id;
    const { action } = req.body;

    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: 'Invalid action. Must be approve or reject.' });
    }

    const request = await db.get('SELECT * FROM TeamRequests WHERE id = ?', [requestId]);
    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is already processed.' });

    const opening = await db.get('SELECT * FROM TeamOpenings WHERE id = ?', [request.opening_id]);
    if (!opening) return res.status(404).json({ error: 'Opening not found.' });

    // Authorization: only opening creator or admin
    if (opening.user_id !== req.user.id && opening.creator_phone !== req.user.phone && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to manage this request.' });
    }

    await db.exec('BEGIN IMMEDIATE TRANSACTION');

      // Re-read under the write lock so concurrent approvals cannot overbook seats.
      const currentRequest = await db.get('SELECT * FROM TeamRequests WHERE id = ?', [requestId]);
      const currentOpening = await db.get('SELECT * FROM TeamOpenings WHERE id = ?', [request.opening_id]);
      if (!currentRequest || currentRequest.status !== 'pending') {
        await db.exec('ROLLBACK');
        return res.status(409).json({ error: 'Request was already processed.' });
      }
      if (!currentOpening) {
        await db.exec('ROLLBACK');
        return res.status(404).json({ error: 'Opening not found.' });
      }

      if (action === 'approve') {
        if (currentOpening.seats <= 0) {
          await db.exec('ROLLBACK');
          return res.status(409).json({ error: 'No seats available to approve this request.' });
        }
        await db.run('UPDATE TeamOpenings SET seats = seats - 1 WHERE id = ?', [currentOpening.id]);
        await db.run('UPDATE TeamRequests SET status = ? WHERE id = ?', ['approved', requestId]);
      } else {
        await db.run('UPDATE TeamRequests SET status = ? WHERE id = ?', ['rejected', requestId]);
      }

    await db.exec('COMMIT');
    res.json({ message: `Request ${action}d successfully.` });
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (rbErr) {}
    next(err);
  }
});

// ───────────────────────────────────────────
// COMMUNITY HUB ROUTES (Phase 9)
// ───────────────────────────────────────────

async function getCommunityPostsList(req) {
  const db = getDB();
  const posts = await db.all('SELECT * FROM CommunityPosts ORDER BY created_at DESC');
  let viewer = null;
  if (req.session && req.session.userId) {
    viewer = await db.get('SELECT id, role FROM Users WHERE id = ?', [req.session.userId]);
  }

  const result = [];
  for (const p of posts) {
    const canViewRequests = Boolean(viewer && (viewer.role === 'admin' || p.user_id === viewer.id));
    const requests = canViewRequests
      ? await db.all('SELECT id, user_id, applicant_name, applicant_phone, applicant_team, applicant_email, upi_ref, status, created_at FROM CommunityRequests WHERE post_id = ? ORDER BY created_at ASC', [p.id])
      : [];
    const requestCount = await db.get('SELECT COUNT(*) AS count FROM CommunityRequests WHERE post_id = ?', [p.id]);

    result.push({
      id: p.id,
      _id: String(p.id),
      userId: p.user_id,
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
      // Personal contact details are intentionally excluded from the public listing.
      createdBy: p.created_by_name || 'Admin',
      createdAt: p.created_at,
      requestsCount: requestCount.count,
      // Applicant contact/payment details are visible only to the post owner or admin.
      requests: requests.map((r) => ({
        id: r.id,
        _id: String(r.id),
        userId: r.user_id,
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

// Public: Get all community posts
communityRouter.get('/', async (req, res, next) => {
  try {
    const list = await getCommunityPostsList(req);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// Create community post (Requires Auth, uses session)
communityRouter.post('/', requireAuth, validateCommunityPost, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;
    const {
      postType,
      sport,
      resolvedName,
      turf,
      turfName,
      numSpots,
      numFare,
      numMaxTeams,
      eventDate,
      matchDate,
      eventTime,
      matchTime,
      prizePool,
      prize,
      status
    } = req.body;

    const type = postType || 'solo';
    const postStatus = status || (type === 'tournament' ? 'Registrations Open' : 'Open');
    const postTurf = (turf || turfName || 'GreenLine Arena').trim();
    const postEventDate = eventDate || matchDate || null;
    const postEventTime = eventTime || matchTime || null;
    const postPrize = prizePool || prize || null;

    const result = await db.run(
      `INSERT INTO CommunityPosts (
        user_id, post_type, sport, team_name, turf, spots, fare, event_date,
        event_time, prize_pool, max_teams, status, created_by_name, created_by_phone, created_by_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        type,
        sport,
        resolvedName,
        postTurf,
        numSpots,
        numFare,
        postEventDate,
        postEventTime,
        postPrize,
        numMaxTeams,
        postStatus,
        user.name,
        user.phone,
        user.email
      ]
    );

    // Sync to TeamOpenings if it is a solo opening with turf
    if (type === 'solo') {
      let turfId = 1;
      if (postTurf) {
        const matched = await db.get('SELECT id FROM Turfs WHERE name LIKE ?', [`%${postTurf}%`]);
        if (matched) turfId = matched.id;
      }
      const openingResult = await db.run(
        `INSERT INTO TeamOpenings (turf_id, user_id, sport, seats, team_size, fare, creator_phone, creator_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [turfId, user.id, sport, numSpots, 11, numFare, user.phone, user.name]
      );
      await db.run('UPDATE CommunityPosts SET team_opening_id = ? WHERE id = ?', [openingResult.lastID, result.lastID]);
    }

    res.status(201).json({
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
    next(err);
  }
});

// Delete community post (Owner or Admin only)
communityRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const postId = req.params.id;
    if (!isValidId(postId)) {
      return res.status(400).json({ error: 'Invalid post ID.' });
    }

    const db = getDB();
    const post = await db.get('SELECT * FROM CommunityPosts WHERE id = ?', [postId]);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Ownership check
    const isOwner =
      post.user_id === req.user.id ||
      post.created_by_email === req.user.email ||
      post.created_by_phone === req.user.phone ||
      req.user.role === 'admin';

    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to delete this post.' });
    }

    if (post.team_opening_id) {
      // Clear the optional back-reference first so SQLite's foreign-key
      // constraint permits removal of the linked opening.
      await db.run('UPDATE CommunityPosts SET team_opening_id = NULL WHERE id = ?', [postId]);
      await db.run('DELETE FROM TeamRequests WHERE opening_id = ?', [post.team_opening_id]);
      await db.run('DELETE FROM TeamOpenings WHERE id = ?', [post.team_opening_id]);
    }
    await db.run('DELETE FROM CommunityRequests WHERE post_id = ?', [postId]);
    await db.run('DELETE FROM CommunityPosts WHERE id = ?', [postId]);

    res.json({ message: 'Community post deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// Join request for a community post (Requires Auth)
communityRouter.post('/:id/request', requireAuth, async (req, res, next) => {
  try {
    const postId = req.params.id;
    if (!isValidId(postId)) {
      return res.status(400).json({ error: 'Invalid post ID.' });
    }

    const db = getDB();
    const post = await db.get('SELECT * FROM CommunityPosts WHERE id = ?', [postId]);
    if (!post) {
      return res.status(404).json({ error: 'Community post not found.' });
    }

    // Cannot join own post
    if (
      post.user_id === req.user.id ||
      post.created_by_phone === req.user.phone ||
      post.created_by_email === req.user.email
    ) {
      return res.status(400).json({ error: 'You cannot request to join your own post.' });
    }

    // Check duplicate request
    const existing = await db.get(
      'SELECT id FROM CommunityRequests WHERE post_id = ? AND (user_id = ? OR applicant_phone = ?)',
      [postId, req.user.id, req.user.phone]
    );
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted a request for this post.' });
    }

    const { applicantTeam, notes, upiTransactionId } = req.body;
    const teamName = (applicantTeam || notes || req.user.name + "'s Squad").trim();

    const result = await db.run(
      `INSERT INTO CommunityRequests (post_id, user_id, applicant_name, applicant_phone, applicant_team, applicant_email, upi_ref, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [postId, req.user.id, req.user.name, req.user.phone, teamName, req.user.email, upiTransactionId || null]
    );

    res.status(201).json({
      message: 'Request submitted successfully!',
      requestId: result.lastID,
      request: {
        id: result.lastID,
        applicantName: req.user.name,
        applicantPhone: req.user.phone,
        status: 'Pending'
      }
    });
  } catch (err) {
    next(err);
  }
});

// Update request status (Accept/Reject - Post Owner or Admin only)
communityRouter.patch('/:id/request/:requestId', requireAuth, async (req, res, next) => {
  const { id: postId, requestId } = req.params;
  const { status } = req.body;

  if (!isValidId(postId) || !isValidId(requestId)) {
    return res.status(400).json({ error: 'Invalid post or request ID.' });
  }
  if (!['Accepted', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Accepted or Rejected.' });
  }

  const db = getDB();
  let transactionStarted = false;
  try {
    const post = await db.get('SELECT * FROM CommunityPosts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const isOwner =
      post.user_id === req.user.id ||
      post.created_by_email === req.user.email ||
      post.created_by_phone === req.user.phone ||
      req.user.role === 'admin';
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden. You do not own this community post.' });
    }

    // Serialize the decision and seat decrement so parallel approvals cannot consume
    // the same final spot or process a request more than once.
    await db.exec('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    const reqRecord = await db.get(
      'SELECT * FROM CommunityRequests WHERE id = ? AND post_id = ?',
      [requestId, postId]
    );
    if (!reqRecord) {
      await db.exec('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (reqRecord.status !== 'Pending') {
      await db.exec('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ error: 'Request has already been processed.' });
    }

    const currentPost = await db.get('SELECT * FROM CommunityPosts WHERE id = ?', [postId]);
    if (status === 'Accepted' && currentPost.post_type === 'solo') {
      if (currentPost.spots <= 0) {
        await db.exec('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ error: 'No spots available to accept this request.' });
      }
      const newSpots = currentPost.spots - 1;
      const newStatus = newSpots === 0 ? 'Full' : currentPost.status;
      await db.run('UPDATE CommunityPosts SET spots = ?, status = ? WHERE id = ?', [newSpots, newStatus, postId]);
    }

    await db.run('UPDATE CommunityRequests SET status = ? WHERE id = ?', [status, requestId]);
    await db.exec('COMMIT');
    transactionStarted = false;
    return res.json({ message: `Request status updated to ${status}.` });
  } catch (err) {
    if (transactionStarted) {
      try { await db.exec('ROLLBACK'); } catch (rollbackError) {}
    }
    next(err);
  }
});

// Delete request (Request owner, Post owner, or Admin)
communityRouter.delete('/:id/request/:requestId', requireAuth, async (req, res, next) => {
  try {
    const { id: postId, requestId } = req.params;
    const db = getDB();

    const post = await db.get('SELECT * FROM CommunityPosts WHERE id = ?', [postId]);
    const reqRecord = await db.get('SELECT * FROM CommunityRequests WHERE id = ? AND post_id = ?', [requestId, postId]);

    if (!reqRecord) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isPostOwner =
      post &&
      (post.user_id === req.user.id ||
        post.created_by_email === req.user.email ||
        post.created_by_phone === req.user.phone);
    const isRequestOwner =
      reqRecord.user_id === req.user.id ||
      reqRecord.applicant_phone === req.user.phone ||
      reqRecord.applicant_email === req.user.email;
    const isAdmin = req.user.role === 'admin';

    if (!isPostOwner && !isRequestOwner && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden. You cannot delete this request.' });
    }

    await db.run('DELETE FROM CommunityRequests WHERE id = ? AND post_id = ?', [requestId, postId]);
    res.json({ message: 'Request removed successfully.' });
  } catch (err) {
    next(err);
  }
});

app.use('/api/community', communityRouter);

// Session-based user community activity
app.get('/api/user/community', requireAuth, async (req, res, next) => {
  try {
    const db = getDB();
    const createdPosts = await db.all(
      `SELECT * FROM CommunityPosts 
       WHERE user_id = ? OR created_by_phone = ? OR created_by_email = ? 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    for (const p of createdPosts) {
      p.requests = await db.all('SELECT * FROM CommunityRequests WHERE post_id = ?', [p.id]);
    }

    const appliedRequests = await db.all(
      `SELECT r.id, r.status, r.created_at, r.upi_ref, p.team_name, p.sport, p.turf, p.post_type, p.fare, p.event_date
       FROM CommunityRequests r
       JOIN CommunityPosts p ON r.post_id = p.id
       WHERE r.user_id = ? OR r.applicant_phone = ? OR r.applicant_email = ?
       ORDER BY r.created_at DESC`,
      [req.user.id, req.user.phone, req.user.email]
    );

    res.json({
      createdPosts,
      appliedRequests,
      posts: createdPosts,
      requests: appliedRequests
    });
  } catch (err) {
    next(err);
  }
});

// Legacy user community endpoint by phone (Protected by ownership/admin)
app.get('/api/user/community/:phone', requireAuth, async (req, res, next) => {
  try {
    const phone = req.params.phone;
    if (req.user.role !== 'admin' && req.user.phone !== phone) {
      return res.status(403).json({ error: 'Forbidden. You may only view your own community activity.' });
    }

    const db = getDB();
    const createdPosts = await db.all(
      `SELECT * FROM CommunityPosts 
       WHERE user_id = ? OR created_by_phone = ? 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    for (const p of createdPosts) {
      p.requests = await db.all('SELECT * FROM CommunityRequests WHERE post_id = ?', [p.id]);
    }

    const appliedRequests = await db.all(
      `SELECT r.id, r.status, r.created_at, r.upi_ref, p.team_name, p.sport, p.turf, p.post_type, p.fare, p.event_date
       FROM CommunityRequests r
       JOIN CommunityPosts p ON r.post_id = p.id
       WHERE r.user_id = ? OR r.applicant_phone = ? 
       ORDER BY r.created_at DESC`,
      [req.user.id, phone]
    );

    res.json({
      createdPosts,
      appliedRequests,
      posts: createdPosts,
      requests: appliedRequests
    });
  } catch (err) {
    next(err);
  }
});

// Forward /community for direct page visits or API
app.use('/community', (req, res, next) => {
  if (
    req.method !== 'GET' ||
    req.headers.accept?.includes('application/json') ||
    req.path.includes('/request') ||
    req.path.length > 1
  ) {
    return communityRouter(req, res, next);
  }
  res.sendFile(path.join(__dirname, '../frontend/community.html'));
});

// Page Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});
app.get('/community.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/community.html'));
});
app.get('/tournaments', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/tournaments.html'));
});
app.get('/tournaments.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/tournaments.html'));
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

// ───────────────────────────────────────────
// CENTRALIZED ERROR HANDLING (Phase 16)
// ───────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message || err);

  const status = err.status || 500;
  let message = err.message || 'Internal server error';

  if (process.env.NODE_ENV === 'production' && status === 500) {
    message = 'An unexpected server error occurred.';
  }

  res.status(status).json({ error: message });
});

// Database initialization and Server Start
const PORT = process.env.PORT || 5000;

async function startServer() {
  await initDB();
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`SQLite Backend Server is running on port ${PORT}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer, initDB };
