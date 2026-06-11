/**
 * Middleware that rejects requests when req.user.role does not match
 * the required role. Works with both JWT auth and mock session.
 */

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires one of the following roles: ${roles.join(', ')}`
      });
    }
    next();
  };
}

module.exports = requireRole;
