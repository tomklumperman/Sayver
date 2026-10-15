const axios = require('axios');

function getFirebaseApiKey() {
  return process.env.FIREBASE_WEB_API_KEY || '';
}

async function lookupFirebaseUser(idToken) {
  const firebaseApiKey = getFirebaseApiKey();
  if (!firebaseApiKey) {
    throw new Error('Missing FIREBASE_WEB_API_KEY for token verification.');
  }

  const response = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
    { idToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  const user = response?.data?.users?.[0];
  if (!user?.localId) {
    throw new Error('Invalid Firebase token: missing localId.');
  }

  return {
    userId: user.localId,
    email: user.email || null,
  };
}

function extractBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return header.slice(7).trim();
}

async function requireUser(req, res, next) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token.' });
    }

    const user = await lookupFirebaseUser(token);
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      details: error?.response?.data?.error?.message || error.message || 'Token verification failed',
    });
  }
}

module.exports = {
  requireUser,
};