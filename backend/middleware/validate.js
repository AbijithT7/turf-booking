// backend/middleware/validate.js

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const PHONE_REGEX = /^\d{10}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const clean = email.trim();
  return clean.length >= 5 && clean.length <= 254 && EMAIL_REGEX.test(clean);
}

function isValidPhone(phone) {
  if (typeof phone !== 'string' && typeof phone !== 'number') return false;
  const clean = String(phone).trim();
  return PHONE_REGEX.test(clean);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function isValidName(name) {
  if (typeof name !== 'string') return false;
  const clean = name.trim();
  return clean.length >= 2 && clean.length <= 100;
}

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

function isValidSlotHour(slot) {
  const num = Number(slot);
  return Number.isInteger(num) && num >= 0 && num <= 23;
}

function isValidId(val) {
  const num = Number(val);
  return Number.isInteger(num) && num > 0;
}

// Route-level validators
function validateRegister(req, res, next) {
  const { name, email, phone, password } = req.body || {};

  if (!isValidName(name)) {
    return res.status(400).json({ error: 'Valid full name (2-100 characters) is required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email address is required.' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Valid 10-digit phone number is required.' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  req.body.phone = String(phone).trim();
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  req.body.email = email.trim().toLowerCase();
  next();
}

function validateBooking(req, res, next) {
  const { turfId, date, selectedSlots, sportType } = req.body || {};

  if (!isValidId(turfId)) {
    return res.status(400).json({ error: 'Valid turf ID is required.' });
  }

  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Valid booking date in YYYY-MM-DD format is required.' });
  }

  if (!Array.isArray(selectedSlots) || selectedSlots.length === 0) {
    return res.status(400).json({ error: 'selectedSlots must be a non-empty array of slot hours.' });
  }

  // Verify all slots are valid integers between 0 and 23
  const slotSet = new Set();
  for (const slot of selectedSlots) {
    if (!isValidSlotHour(slot)) {
      return res.status(400).json({ error: `Invalid slot hour: ${slot}. Must be integer between 0 and 23.` });
    }
    const intSlot = Number(slot);
    if (slotSet.has(intSlot)) {
      return res.status(400).json({ error: `Duplicate slot hour ${intSlot} found in request.` });
    }
    slotSet.add(intSlot);
  }

  const sport = (sportType || 'Football').trim();
  if (sport.length < 2 || sport.length > 50) {
    return res.status(400).json({ error: 'Sport type must be between 2 and 50 characters.' });
  }

  req.body.turfId = Number(turfId);
  req.body.sportType = sport;
  req.body.selectedSlots = Array.from(slotSet);
  next();
}

function validateBlockedSlot(req, res, next) {
  const { turfId, date, slotHour } = req.body || {};

  if (!isValidId(turfId)) {
    return res.status(400).json({ error: 'Valid turf ID is required.' });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Valid date in YYYY-MM-DD format is required.' });
  }
  if (!isValidSlotHour(slotHour)) {
    return res.status(400).json({ error: 'Valid slot hour (0-23) is required.' });
  }

  req.body.turfId = Number(turfId);
  req.body.slotHour = Number(slotHour);
  next();
}

function validateOpening(req, res, next) {
  const { turfId, sport, seats, teamSize, fare } = req.body || {};

  if (!isValidId(turfId)) {
    return res.status(400).json({ error: 'Valid turf ID is required.' });
  }
  if (!sport || typeof sport !== 'string' || sport.trim().length < 2) {
    return res.status(400).json({ error: 'Sport is required.' });
  }

  const numSeats = Number(seats);
  if (!Number.isInteger(numSeats) || numSeats <= 0 || numSeats > 50) {
    return res.status(400).json({ error: 'Seats must be a positive integer (1-50).' });
  }

  const numTeamSize = Number(teamSize);
  if (!Number.isInteger(numTeamSize) || numTeamSize <= 0 || numTeamSize > 50) {
    return res.status(400).json({ error: 'Team size must be a positive integer.' });
  }

  const numFare = fare !== undefined ? Number(fare) : 0;
  if (isNaN(numFare) || numFare < 0 || numFare > 100000) {
    return res.status(400).json({ error: 'Fare must be a non-negative number.' });
  }

  req.body.turfId = Number(turfId);
  req.body.sport = sport.trim();
  req.body.seats = numSeats;
  req.body.teamSize = numTeamSize;
  req.body.fare = Math.round(numFare);
  next();
}

function validateCommunityPost(req, res, next) {
  const { sport, teamName, title, postType, spots, openSpots, fare, farePerPlayer, maxTeams, teamSize } = req.body || {};

  const resolvedName = (teamName || title || '').trim();
  if (!sport || typeof sport !== 'string' || !resolvedName) {
    return res.status(400).json({ error: 'Sport and title/team name are required.' });
  }

  const numSpots = spots !== undefined ? Number(spots) : (openSpots !== undefined ? Number(openSpots) : 1);
  if (!Number.isInteger(numSpots) || numSpots < 1 || numSpots > 100) {
    return res.status(400).json({ error: 'Spots must be an integer between 1 and 100.' });
  }

  const numFare = fare !== undefined ? Number(fare) : (farePerPlayer !== undefined ? Number(farePerPlayer) : 0);
  if (isNaN(numFare) || numFare < 0 || numFare > 100000) {
    return res.status(400).json({ error: 'Fare must be a non-negative number.' });
  }

  const numMaxTeams = maxTeams !== undefined ? Number(maxTeams) : (teamSize !== undefined ? Number(teamSize) : 16);
  if (!Number.isInteger(numMaxTeams) || numMaxTeams < 1 || numMaxTeams > 128) {
    return res.status(400).json({ error: 'Max teams must be between 1 and 128.' });
  }

  req.body.resolvedName = resolvedName;
  req.body.sport = sport.trim();
  req.body.numSpots = numSpots;
  req.body.numFare = Math.round(numFare);
  req.body.numMaxTeams = numMaxTeams;
  next();
}

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidName,
  isValidDate,
  isValidSlotHour,
  isValidId,
  validateRegister,
  validateLogin,
  validateBooking,
  validateBlockedSlot,
  validateOpening,
  validateCommunityPost
};
