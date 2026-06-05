// TODO(PHASE-8: REPLACE WITH JWT): This mock middleware reads user identity
// from request headers/query parameters. In Phase 8 (WI-802), it will be
// replaced with real Supabase JWT validation.

module.exports = function mockSession(req, res, next) {
  // Prefer headers, fall back to query parameters
  const role =
    req.header('x-mock-role') ||
    req.query.role ||
    null;

  const userId =
    req.header('x-mock-user-id') ||
    req.query.userId ||
    null;

  req.mockUserRole = role;
  req.mockUserId = userId;

  console.log(
    `[MOCK SESSION] ${req.method} ${req.originalUrl} -> role=${role || 'anonymous'} userId=${userId || 'anonymous'}`
  );

  next();
};
