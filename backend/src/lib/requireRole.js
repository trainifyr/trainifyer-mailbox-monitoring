// Middleware that rejects requests when req.mockUserRole does not match
// the required role. Used in Phase 1-7. In Phase 8 (WI-802) this will be
// replaced by real JWT role checks.
// TODO(PHASE-8: REPLACE WITH JWT ROLE VALIDATION)

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.mockUserRole || !roles.includes(req.mockUserRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires one of the following roles: ${roles.join(', ')}`
      });
    }
    next();
  };
}

module.exports = requireRole;
