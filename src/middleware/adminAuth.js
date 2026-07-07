const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin portal not configured — set ADMIN_PASSWORD env var' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="ZimRx Admin"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const encoded = authHeader.slice('Basic '.length);
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');

  if (user !== ADMIN_USERNAME || pass !== ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="ZimRx Admin"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  next();
}

module.exports = adminAuth;
