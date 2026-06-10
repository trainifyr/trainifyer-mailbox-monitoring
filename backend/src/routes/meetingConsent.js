const { Router } = require('express');
const { z } = require('zod');
const pool = require('../lib/pgPool');

const router = Router({ mergeParams: true });

// --- Zod schemas ---

const consentBodySchema = z.object({
  externalName: z.string().min(1).max(100).optional()
});

// --- GET /api/meetings/:id/consent ---
// Check whether the current user has already consented to this meeting.
// Returns { consented: true/false, consent: {...} | null }.

router.get('/', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.mockUserId;

    // Verify the meeting exists
    const { rows: meetingRows } = await pool.query(
      `SELECT id, status FROM public.meetings WHERE id = $1`,
      [id]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }

    let consentRecord = null;

    if (userId) {
      const { rows } = await pool.query(
        `SELECT id, meeting_id, user_id, external_name, accepted_at, user_agent
         FROM public.meeting_consents
         WHERE meeting_id = $1 AND user_id = $2
         ORDER BY accepted_at DESC
         LIMIT 1`,
        [id, userId]
      );
      if (rows.length > 0) consentRecord = rows[0];
    }

    res.json({
      data: {
        consented: consentRecord !== null,
        consent: consentRecord
      }
    });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/meetings/:id/consent ---
// Record a privacy consent for the current user.
// - Authenticated users: uses req.mockUserId.
// - Anonymous users: must provide externalName in the body.
// Idempotent: if a consent record already exists for this user+meeting,
// returns the existing record (200) instead of creating a duplicate (201).

router.post('/', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.mockUserId;
    const body = consentBodySchema.parse(req.body);

    // Verify the meeting exists
    const { rows: meetingRows } = await pool.query(
      `SELECT id, status FROM public.meetings WHERE id = $1`,
      [id]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }

    const meeting = meetingRows[0];

    if (meeting.status === 'CANCELLED' || meeting.status === 'ENDED') {
      return res.status(410).json({
        error: 'Gone',
        message: `This meeting has been ${meeting.status.toLowerCase()} and cannot be joined`
      });
    }

    // Determine identity
    let participantUserId = null;
    let participantExternalName = null;

    if (userId) {
      participantUserId = userId;
      // Check for existing consent (idempotent)
      const { rows: existing } = await pool.query(
        `SELECT id, meeting_id, user_id, external_name, accepted_at, user_agent
         FROM public.meeting_consents
         WHERE meeting_id = $1 AND user_id = $2
         LIMIT 1`,
        [id, userId]
      );
      if (existing.length > 0) {
        return res.json({ data: existing[0] });
      }
    } else if (body.externalName) {
      participantExternalName = body.externalName;
    } else {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Provide a mock user ID (via headers) or an externalName in the request body'
      });
    }

    // Insert the consent record
    const { rows } = await pool.query(
      `INSERT INTO public.meeting_consents (meeting_id, user_id, external_name, user_agent)
       VALUES ($1, $2, $3, $4)
       RETURNING id, meeting_id, user_id, external_name, accepted_at, user_agent`,
      [id, participantUserId, participantExternalName, req.headers['user-agent'] || null]
    );

    res.status(201).json({ data: rows[0] });
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
