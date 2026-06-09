const { Router } = require('express');
const { z } = require('zod');
const pool = require('../lib/pgPool');
const requireRole = require('../lib/requireRole');

const router = Router({ mergeParams: true });

// --- Zod schemas ---

const updateSettingsSchema = z.object({
  mailbox_enabled: z.boolean().optional(),
  student_to_student_messaging: z.boolean().optional(),
  meeting_join_enabled: z.boolean().optional(),
  require_camera: z.boolean().optional(),
  require_microphone: z.boolean().optional(),
  require_screen_share: z.enum(['REQUIRED', 'OPTIONAL', 'OFF']).optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one setting field must be provided' }
);

// --- GET /api/batches/:id/settings ---
// Returns the settings object for a batch. Open to all roles.

router.get('/', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT id, batch_id,
              mailbox_enabled,
              student_to_student_messaging,
              meeting_join_enabled,
              require_camera,
              require_microphone,
              require_screen_share,
              created_at,
              updated_at
       FROM public.batch_settings
       WHERE batch_id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Settings not found for this batch'
      });
    }

    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// --- PATCH /api/batches/:id/settings ---
// Update one or more settings fields. Admin only.

router.patch('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateSettingsSchema.parse(req.body);

    // Verify the batch exists (fail early with 404)
    const { rows: batchCheck } = await pool.query(
      `SELECT id FROM public.batches WHERE id = $1`,
      [id]
    );
    if (batchCheck.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
    }

    // Check if a settings row exists; if not, insert defaults first
    const { rows: existing } = await pool.query(
      `SELECT id FROM public.batch_settings WHERE batch_id = $1`,
      [id]
    );
    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO public.batch_settings (batch_id) VALUES ($1)`,
        [id]
      );
    }

    // Build dynamic SET clause from provided fields
    const allowedFields = [
      'mailbox_enabled',
      'student_to_student_messaging',
      'meeting_join_enabled',
      'require_camera',
      'require_microphone',
      'require_screen_share'
    ];

    const sets = [];
    const params = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(body[field]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'No fields to update' });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE public.batch_settings SET ${sets.join(', ')} WHERE batch_id = $${idx}
       RETURNING id, batch_id,
                 mailbox_enabled,
                 student_to_student_messaging,
                 meeting_join_enabled,
                 require_camera,
                 require_microphone,
                 require_screen_share,
                 created_at,
                 updated_at`,
      params
    );

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

module.exports = router;
