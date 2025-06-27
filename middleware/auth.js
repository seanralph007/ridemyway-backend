// middleware/auth.js
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  console.log("🔐 Auth middleware running");
  // console.log("Cookies:", req.cookies);

  const token = req.cookies.token;

  if (!token) {
    console.log("❌ No token found in cookies");
    return res.status(401).json({ message: 'Unauthorized (No token)' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    // console.log("✅ Token verified:", decoded);
    next();
  } catch (err) {
    console.error("❌ JWT verification failed:", err.message);
    res.clearCookie("token"); // Clear expired/invalid token
    return res.status(403).json({ message: 'Forbidden (Invalid or expired token)' });
  }
}

module.exports = authMiddleware;