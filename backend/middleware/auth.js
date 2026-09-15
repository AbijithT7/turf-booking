const { getDB } = require('../db');

async function requireAuth(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthenticated. Please log in.' });
    }

    const db = getDB();
    const user = await db.get(
      'SELECT id, name, email, phone, role, created_at FROM Users WHERE id = ?',
      [req.session.userId]
    );

    if (!user) {
      // Session references nonexistent user
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Session invalid. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin authorization required.' });
    }
    next();
  });
}

module.exports = {
  requireAuth,
  requireAdmin
};
