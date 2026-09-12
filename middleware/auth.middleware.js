const jwt = require("jsonwebtoken");

// Middleware to verify access token and optional role check
const verifyToken = (roles = []) => {
  if (typeof roles === "string") {
    roles = [roles];
  }

  return (req, res, next) => {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (!authHeader) {
      return res.status(401).json({ message: "Access token missing" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token format invalid" });
    }

    jwt.verify(token, process.env.SECRET || "ACCESS_TOKEN_SECRET", (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
      }

      req.user = decoded; // { id, role, email }

      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Access forbidden: insufficient permissions" });
      }

      next();
    });
  };
};

module.exports = { verifyToken };
