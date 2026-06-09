const { Router } = require('express');
const { z }       = require('zod');
const pool        = require('../lib/pgPool');
const requireRole  = require('../lib/requireRole');

const router = Router();

// --- Zod schemas ---

const createBatchSchema = z.object({
  name: z.string().min(1, 'Batch name is required')
});

const updateBatchSchema = z.object({
  name:   z.string().min(1, 'Batch name is required').optional(),
  status: z.enum(['active', 'inactive']).optional()
}).refine((data) => data.name || data.status, {
  message: 'At least one field (name, status) must be provided'
});

const assignStudentSchema = z.object({
  studentId: z.string().uuid('studentId must be a valid UUID')
});

// --- GET /api/batches ---
// List all batches, ordered by creation date descending. Open to all roles.

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.name, b.status, b.created_at, b.updated_at,
              (SELECT COUNT(*)::int FROM public.student_batches sb WHERE sb.batch_id = b.id) AS student_count
       FROM public.batches b
       ORDER BY b.created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/batches ---
// Create a batch and its default batch_settings row in a single transaction.
// Admin only.

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = createBatchSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows: batchRows } = await client.query(
      `INSERT INTO public.batches (name) VALUES ($1) RETURNING id, name, status, created_at, updated_at`,
      [body.name]
    );
    const batch = batchRows[0];

    // Insert default batch_settings — all columns use DB defaults except batch_id
    await client.query(
      `INSERT INTO public.batch_settings (batch_id) VALUES ($1)`,
      [batch.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ data: batch });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    next(err);
  } finally {
    client.release();
  }
});

// --- PATCH /api/batches/:id ---
// Update a batch's name and/or status. Admin only.

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body   = updateBatchSchema.parse(req.body);

    const sets   = [];
    const params = [];
    let idx      = 1;

    if (body.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(body.name);
    }
    if (body.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(body.status);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'No fields to update' });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE public.batches SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, name, status, created_at, updated_at`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
    }

    res.json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    next(err);
  }
});

// --- GET /api/batches/:id/students ---
// List all students assigned to a given batch. Open to all roles.

router.get('/:id/students', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify batch exists
    const { rows: batchCheck } = await pool.query(
      `SELECT id FROM public.batches WHERE id = $1`,
      [id]
    );
    if (batchCheck.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.created_at, u.updated_at,
              sb.assigned_at
       FROM public.users u
       JOIN public.student_batches sb ON sb.student_id = u.id
       WHERE sb.batch_id = $1 AND u.role = 'STUDENT'
       ORDER BY u.full_name ASC`,
      [id]
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/batches/:id/students ---
// Assign a student to a batch. Admin only.
// Enforces the single-batch-per-student constraint (student_batches_single_batch UNIQUE key).
// Returns 409 Conflict if the student is already assigned to any batch.

router.post('/:id/students', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body   = assignStudentSchema.parse(req.body);

    // Verify the student exists and has role STUDENT
    const { rows: studentRows } = await pool.query(
      `SELECT id, role FROM public.users WHERE id = $1`,
      [body.studentId]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Student not found' });
    }
    if (studentRows[0].role !== 'STUDENT') {
      return res.status(400).json({ error: 'Bad Request', message: 'User is not a student' });
    }

    // Verify the batch exists
    const { rows: batchRows } = await pool.query(
      `SELECT id FROM public.batches WHERE id = $1`,
      [id]
    );
    if (batchRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO public.student_batches (student_id, batch_id)
       VALUES ($1, $2)
       RETURNING id, student_id, batch_id, assigned_at`,
      [body.studentId, id]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    // student_batches_single_batch unique violation — student already in a batch
    if (err.code === '23505') {
      const { rows: existing } = await pool.query(
        `SELECT batch_id FROM public.student_batches WHERE student_id = $1`,
        [err.studentId || req.body.studentId]
      );
      if (existing.length > 0 && existing[0].batch_id === req.params.id) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Student is already assigned to this batch'
        });
      }
      return res.status(409).json({
        error: 'Conflict',
        message: 'Student is already assigned to another batch (single-batch-per-student rule)'
      });
    }
    next(err);
  }
});

module.exports = router;
