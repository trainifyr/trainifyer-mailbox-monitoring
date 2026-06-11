const supabase = require('../lib/supabaseClient');
const { Pool } = require('pg');

// Lazy-init pool so the server boots even if DATABASE_URL is missing
let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
    });
  }
  return pool;
}

/**
 * JWT Auth Middleware
 *
 * Uses the Supabase Admin SDK (supabase.auth.getUser) to verify the JWT.
 * This is the recommended approach — avoids manual JWT secret handling.
 *
 * Sets req.user = { id, email, full_name, role } | null
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.header('Authorization');

    // --- Strategy 1: JWT Bearer token via Supabase Admin SDK ---
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      try {
        // Let Supabase verify the token — no need to handle secret/algorithm manually
        const { data: { user: authUser }, error } = await supabase.auth.getUser(token);

        if (error) {
          console.warn('[AUTH] Supabase token verification failed:', error.message);
        } else if (authUser?.id) {
          // Look up user profile from public.users using the Supabase Auth UUID
          const db = getPool();
          const { rows } = await db.query(
            `SELECT id, email, full_name, role FROM public.users WHERE supabase_user_id = $1`,
            [authUser.id]
          );

          if (rows.length > 0) {
            const user = rows[0];
            req.user = user;
            req.mockUserRole = user.role;
            req.mockUserId = user.id;

            console.log(
              `[AUTH] ${req.method} ${req.originalUrl} -> JWT user=${user.full_name} role=${user.role}`
            );

            return next();
          } else {
            console.warn(`[AUTH] Supabase Auth user ${authUser.id} has no profile in public.users`);
          }
        }
      } catch (err) {
        console.warn('[AUTH] Supabase getUser error:', err.message);
      }
    }

    // --- Strategy 2: Mock headers (dev mode fallback) ---
    const mockRole = req.header('x-mock-role') || null;
    const mockUserId = req.header('x-mock-user-id') || null;

    if (mockRole && mockUserId) {
      req.user = {
        id: mockUserId,
        email: `${mockUserId}@mock.local`,
        full_name: `Mock ${mockRole}`,
        role: mockRole
      };
      req.mockUserRole = mockRole;
      req.mockUserId = mockUserId;

      console.log(
        `[AUTH] ${req.method} ${req.originalUrl} -> MOCK role=${mockRole} userId=${mockUserId}`
      );

      return next();
    }

    // --- Unauthenticated ---
    req.user = null;
    req.mockUserRole = null;
    req.mockUserId = null;

    console.log(
      `[AUTH] ${req.method} ${req.originalUrl} -> anonymous`
    );

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authMiddleware;
