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
// Manually creates a Supabase Auth user with a default password.

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = createStudentSchema.parse(req.body);

    const TEMP_PASSWORD = 'Trainifyer@2024';
    let supabaseUserId = null;

    // 1. Try to create the Auth account. If it already exists, find & update it.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: body.fullName }
    });

    if (authError) {
      if (authError.status === 422) {
        // User already exists in Auth — look them up and reset their password
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        if (!listError) {
          const existing = users.find(u => u.email === body.email);
          if (existing) {
            await supabase.auth.admin.updateUserById(existing.id, {
              password: TEMP_PASSWORD,
              email_confirm: true
            });
            supabaseUserId = existing.id;
          }
        }
      } else {
        return res.status(authError.status || 400).json({ 
          error: 'Auth Error', 
          message: authError.message 
        });
      }
    } else {
      supabaseUserId = authData?.user?.id || null;
    }

    // 2. Insert into public.users
    const { rows } = await pool.query(
      `INSERT INTO public.users (email, full_name, role, supabase_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role, supabase_user_id, created_at, updated_at`,
      [body.email, body.fullName, body.role, supabaseUserId]
    );

    res.status(201).json({ 
      data: { ...rows[0], tempPassword: TEMP_PASSWORD } 
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
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
       RETURNING id, email, full_name, role, supabase_user_id, created_at, updated_at`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Student not found' });
    }

    const updatedStudent = rows[0];
    const TEMP_PASSWORD = 'Trainifyer@2024';

    // Ensure we have a Supabase Auth account linked when email is provided
    if (body.email) {
      if (updatedStudent.supabase_user_id) {
        // CASE A: User already linked, just update email and reset password
        const { error: syncError } = await supabase.auth.admin.updateUserById(
          updatedStudent.supabase_user_id,
          { 
            email: body.email,
            password: TEMP_PASSWORD,
            email_confirm: true 
          }
        );
        if (!syncError) updatedStudent.tempPassword = TEMP_PASSWORD;
      } else {
        // CASE B: Legacy user not yet in Auth. Create them now!
        const { data: authData, error: createError } = await supabase.auth.admin.createUser({
          email: body.email,
          password: TEMP_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: updatedStudent.full_name }
        });
        
        if (!createError && authData?.user) {
          // Link the newly created auth ID to the profile
          await pool.query(
            'UPDATE public.users SET supabase_user_id = $1 WHERE id = $2',
            [authData.user.id, updatedStudent.id]
          );
          updatedStudent.tempPassword = TEMP_PASSWORD;
        }
      }
    }

    res.json({ data: updatedStudent });
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

// --- POST /api/users/students/:id/reset-password ---
// Force-reset a student's password to the default. Admin only.

router.post('/:id/reset-password', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const TEMP_PASSWORD = 'Trainifyer@2024';

    // Get the student's supabase_user_id and email
    const { rows } = await pool.query(
      `SELECT id, email, full_name, supabase_user_id FROM public.users WHERE id = $1 AND role = 'STUDENT'`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Student not found' });
    }

    const student = rows[0];
    let supabaseUserId = student.supabase_user_id;

    if (supabaseUserId) {
      // Already linked — just reset the password
      await supabase.auth.admin.updateUserById(supabaseUserId, {
        password: TEMP_PASSWORD,
        email_confirm: true
      });
    } else {
      // Not linked — look up by email or create fresh
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const existing = users.find(u => u.email === student.email);

      if (existing) {
        await supabase.auth.admin.updateUserById(existing.id, {
          password: TEMP_PASSWORD,
          email_confirm: true
        });
        supabaseUserId = existing.id;
      } else {
        const { data: newAuth } = await supabase.auth.admin.createUser({
          email: student.email,
          password: TEMP_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: student.full_name }
        });
        supabaseUserId = newAuth?.user?.id;
      }

      // Link the auth ID back to public.users
      if (supabaseUserId) {
        await pool.query('UPDATE public.users SET supabase_user_id = $1 WHERE id = $2', [supabaseUserId, id]);
      }
    }

    res.json({ message: 'Password reset successfully', tempPassword: TEMP_PASSWORD });
  } catch (err) {
    next(err);
  }
});

// --- DELETE /api/users/students/:id ---
// Remove a student profile and their Supabase Auth account. Admin only.

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Find the user first to get the supabase_user_id
    const { rows } = await pool.query(`SELECT supabase_user_id FROM public.users WHERE id = $1 AND role = 'STUDENT'`, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Student not found' });
    }

    const supabaseUserId = rows[0].supabase_user_id;

    // 2. Delete from Supabase Auth if linked
    if (supabaseUserId) {
      await supabase.auth.admin.deleteUser(supabaseUserId);
    }

    // 3. Delete from public.users
    await pool.query('DELETE FROM public.users WHERE id = $1', [id]);

    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
