const { Router } = require('express');
const { z }      = require('zod');
const pool       = require('../lib/pgPool');
const requireRole = require('../lib/requireRole');

const router = Router();

// --- Zod schemas ---

const createStudentSchema = z.object({
  email:    z.string().email('Invalid email address'),
  fullName: z.string().min(1, 'Full name is required'),
  role:     z.literal('STUDENT')
});

const updateStudentSchema = z.object({
  email:    z.string().email('Invalid email address').optional(),
  fullName: z.string().min(1, 'Full name is required').optional()
}).refine((data) => data.email || data.fullName, {
  message: 'At least one field (email, fullName) must be provided'
});

// --- GET /api/users/students ---
// List all students. Optional ?batchId= filter to scope to a batch.
// Open to all roles (no requireRole guard).

router.get('/', async (req, res, next) => {
  try {
    const { batchId } = req.query;
    let query, params;

    if (batchId) {
      query = `
        SELECT u.id, u.email, u.full_name, u.role, u.created_at, u.updated_at,
               sb.batch_id, sb.assigned_at
        FROM public.users u
        LEFT JOIN public.student_batches sb ON sb.student_id = u.id
        WHERE u.role = 'STUDENT' AND sb.batch_id = $1
        ORDER BY u.full_name ASC
      `;
      params = [batchId];
    } else {
      query = `
        SELECT u.id, u.email, u.full_name, u.role, u.created_at, u.updated_at,
               sb.batch_id, sb.assigned_at
        FROM public.users u
        LEFT JOIN public.student_batches sb ON sb.student_id = u.id
        WHERE u.role = 'STUDENT'
        ORDER BY u.full_name ASC
      `;
      params = [];
    }

    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// --- GET /api/users/directory ---
// List all users (Admins and Students) for mailbox searching.
// Open to all authenticated roles.
router.get('/directory', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, role FROM public.users
       ORDER BY full_name ASC`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

const supabase = require('../lib/supabaseClient');

// --- POST /api/users/students ---
// Create a student profile. Admin only.
// Generates a real Supabase Auth invitation and links it to the profile.

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = createStudentSchema.parse(req.body);

    // 1. Create/Invite user in Supabase Auth using Service Role key
    // This sends the "Join" email with a password-reset link.
    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(body.email, {
      data: { full_name: body.fullName }
    });

    if (authError) {
      // If the user already exists in Auth but not in public.users, we continue
      // If it's a real error (like invalid email), we stop.
      if (authError.status !== 422) { // 422 usually means user already exists
         return res.status(authError.status || 400).json({ 
           error: 'Auth Error', 
           message: authError.message 
         });
      }
    }

    const authUser = authData?.user;
    const supabaseUserId = authUser?.id || null;

    // 2. Insert into public.users
    const { rows } = await pool.query(
      `INSERT INTO public.users (email, full_name, role, supabase_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role, supabase_user_id, created_at, updated_at`,
      [body.email, body.fullName, body.role, supabaseUserId]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    // Unique violation (email already exists in public.users)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'A profile with this email already exists' });
    }
    next(err);
  }
});

// --- PATCH /api/users/students/:id ---
// Update a student's name and/or email. Admin only.

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body   = updateStudentSchema.parse(req.body);

    const sets   = [];
    const params = [];
    let idx      = 1;

    if (body.email !== undefined) {
      sets.push(`email = $${idx++}`);
      params.push(body.email);
    }
    if (body.fullName !== undefined) {
      sets.push(`full_name = $${idx++}`);
      params.push(body.fullName);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'No fields to update' });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE public.users SET ${sets.join(', ')} WHERE id = $${idx} AND role = 'STUDENT'
       RETURNING id, email, full_name, role, created_at, updated_at`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Student not found' });
    }

    res.json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'A user with this email already exists' });
    }
    next(err);
  }
});

module.exports = router;
