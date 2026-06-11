const { verify } = require('jsonwebtoken');
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

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * JWT Auth Middleware
 *
 * Extracts user identity from:
 *   1. Authorization: Bearer <JWT> (Supabase real auth)
 *   2. x-mock-role / x-mock-user-id headers (dev mode — TODO(PHASE-8: REMOVE))
 *
 * Sets req.user = { id, email, full_name, role } | null
 * Also sets req.mockUserRole and req.mockUserId for backward compat.
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.header('Authorization');

    // --- Strategy 1: JWT Bearer token ---
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      if (!JWT_SECRET) {
        console.error('[AUTH] SUPABASE_JWT_SECRET is not configured. JWT verification disabled.');
        // Fall through to mock fallback
      } else {
        try {
          const decoded = verify(token, JWT_SECRET, {
            algorithms: ['HS256']
          });

          const userId = decoded.sub;

          if (userId) {
            // Fetch user profile from database
            const db = getPool();
            const { rows } = await db.query(
              `SELECT id, email, full_name, role FROM public.users WHERE id = $1`,
              [userId]
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
              console.warn(`[AUTH] JWT user ${userId} not found in public.users table`);
            }
          }
        } catch (jwtErr) {
          console.warn('[AUTH] JWT verification failed:', jwtErr.message);
          // Fall through to mock fallback
        }
      }
    }

    // --- Strategy 2: Mock headers (dev mode) ---
    // TODO(PHASE-8: REMOVE) - Remove this fallback when WI-803 enforces real auth
    const mockRole = req.header('x-mock-role') || req.query.role || null;
    const mockUserId = req.header('x-mock-user-id') || req.query.userId || null;

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
