const { Router } = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const pool = require('../lib/pgPool');
const requireRole = require('../lib/requireRole');

const router = Router();

// --- Zod schemas ---

const createMeetingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  batchId: z.string().uuid('batchId must be a valid UUID').nullable().optional().default(null),
  isPublic: z.boolean().optional().default(false),
  scheduledStart: z.string().datetime({ offset: true }).nullable().optional().default(null),
  scheduledEnd: z.string().datetime({ offset: true }).nullable().optional().default(null)
}).refine(
  (data) => {
    // If isPublic is true, batchId must be null
    if (data.isPublic && data.batchId) {
      return false;
    }
    return true;
  },
  { message: 'Public meetings cannot have a batchId', path: ['batchId'] }
).refine(
  (data) => {
    // If isPublic is false (batch meeting), batchId is required
    if (!data.isPublic && !data.batchId) {
      return false;
    }
    return true;
  },
  { message: 'Batch meetings require a batchId', path: ['batchId'] }
);

const publicJoinSchema = z.object({
  externalName: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  meetingId: z.string().uuid('meetingId must be a valid UUID')
});

// --- Helpers ---

// Generate a unique Jitsi room name: trainifyer-<6 random hex chars>-<slugified title>
function generateRoomName(title) {
  const random = crypto.randomBytes(3).toString('hex');
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
  return `trainifyer-${random}-${slug}`;
}

// Get the batch ID(s) a student is assigned to
async function getStudentBatchIds(studentId) {
  const { rows } = await pool.query(
    `SELECT batch_id FROM public.student_batches WHERE student_id = $1`,
    [studentId]
  );
  return rows.map((r) => r.batch_id);
}

// --- GET /api/meetings ---
// List meetings visible to the current user.
// Admin: all meetings. Student: batch meetings for their batch(es) + public meetings.
// Anonymous: only public meetings.

router.get('/', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    const role = req.mockUserRole;

    let rows;

    if (role === 'ADMIN') {
      // Admin sees all meetings
      const result = await pool.query(
        `SELECT m.id, m.title, m.batch_id, m.jitsi_room_name, m.is_public,
                m.scheduled_start, m.scheduled_end, m.status, m.created_by, m.created_at, m.updated_at,
                creator.full_name AS created_by_name,
                b.name AS batch_name
         FROM public.meetings m
         LEFT JOIN public.users creator ON creator.id = m.created_by
         LEFT JOIN public.batches b ON b.id = m.batch_id
         ORDER BY m.scheduled_start ASC NULLS LAST, m.created_at DESC`
      );
      rows = result.rows;
    } else if (role === 'STUDENT' && userId) {
      // Student sees batch meetings for their batch + public meetings
      const batchIds = await getStudentBatchIds(userId);

      if (batchIds.length === 0) {
        // Student not assigned to any batch — only see public meetings
        const result = await pool.query(
          `SELECT m.id, m.title, m.batch_id, m.jitsi_room_name, m.is_public,
                  m.scheduled_start, m.scheduled_end, m.status, m.created_by, m.created_at, m.updated_at,
                  creator.full_name AS created_by_name,
                  b.name AS batch_name
           FROM public.meetings m
           LEFT JOIN public.users creator ON creator.id = m.created_by
           LEFT JOIN public.batches b ON b.id = m.batch_id
           WHERE m.is_public = true
           ORDER BY m.scheduled_start ASC NULLS LAST, m.created_at DESC`
        );
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT m.id, m.title, m.batch_id, m.jitsi_room_name, m.is_public,
                  m.scheduled_start, m.scheduled_end, m.status, m.created_by, m.created_at, m.updated_at,
                  creator.full_name AS created_by_name,
                  b.name AS batch_name
           FROM public.meetings m
           LEFT JOIN public.users creator ON creator.id = m.created_by
           LEFT JOIN public.batches b ON b.id = m.batch_id
           WHERE m.is_public = true OR m.batch_id = ANY($1::uuid[])
           ORDER BY m.scheduled_start ASC NULLS LAST, m.created_at DESC`,
          [batchIds]
        );
        rows = result.rows;
      }
    } else {
      // Anonymous — only public meetings
      const result = await pool.query(
        `SELECT m.id, m.title, m.batch_id, m.jitsi_room_name, m.is_public,
                m.scheduled_start, m.scheduled_end, m.status, m.created_by, m.created_at, m.updated_at,
                creator.full_name AS created_by_name,
                b.name AS batch_name
         FROM public.meetings m
         LEFT JOIN public.users creator ON creator.id = m.created_by
         LEFT JOIN public.batches b ON b.id = m.batch_id
         WHERE m.is_public = true
         ORDER BY m.scheduled_start ASC NULLS LAST, m.created_at DESC`
      );
      rows = result.rows;
    }

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/meetings ---
// Create a new meeting. Admin only.
// Generates a unique Jitsi room name automatically.

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const creatorId = req.mockUserId;
    if (!creatorId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const body = createMeetingSchema.parse(req.body);

    // Verify the creator exists
    const { rows: creatorRows } = await pool.query(
      `SELECT id FROM public.users WHERE id = $1`,
      [creatorId]
    );
    if (creatorRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Creator user not found' });
    }

    // If batchId provided, verify the batch exists
    if (body.batchId) {
      const { rows: batchRows } = await pool.query(
        `SELECT id FROM public.batches WHERE id = $1`,
        [body.batchId]
      );
      if (batchRows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
      }
    }

    // Generate unique room name
    const roomName = generateRoomName(body.title);

    const { rows } = await pool.query(
      `INSERT INTO public.meetings (title, batch_id, jitsi_room_name, is_public, scheduled_start, scheduled_end, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, batch_id, jitsi_room_name, is_public, scheduled_start, scheduled_end, status, created_by, created_at, updated_at`,
      [
        body.title,
        body.batchId,
        roomName,
        body.isPublic,
        body.scheduledStart,
        body.scheduledEnd,
        creatorId
      ]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    // Unique violation on jitsi_room_name
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'A meeting with this room name already exists. Try again.' });
    }
    next(err);
  }
});

// --- POST /api/meetings/public/join ---
// Register intent to join a public meeting.
// - Authenticated users: identified by req.mockUserId, creates participant with user_id.
// - Anonymous users: must provide externalName, creates participant with external_name.
// Returns the meeting info + participant record.

router.post('/public/join', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    const body = publicJoinSchema.parse(req.body);

    // Determine identity: authenticated user OR external name
    let participantUserId = null;
    let participantExternalName = null;

    if (userId) {
      participantUserId = userId;

      // Verify user exists
      const { rows: userRows } = await pool.query(
        `SELECT id FROM public.users WHERE id = $1`,
        [userId]
      );
      if (userRows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'User not found' });
      }
    } else if (body.externalName) {
      participantExternalName = body.externalName;
    } else {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Provide a mock user ID (via headers) or an externalName in the request body'
      });
    }

    // Verify the meeting exists and is public
    const { rows: meetingRows } = await pool.query(
      `SELECT id, title, jitsi_room_name, is_public, status, batch_id
       FROM public.meetings WHERE id = $1`,
      [body.meetingId]
    );

    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }

    const meeting = meetingRows[0];

    if (!meeting.is_public) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This endpoint is only for public meetings. Use the batch meeting join flow instead.'
      });
    }

    if (meeting.status === 'CANCELLED' || meeting.status === 'ENDED') {
      return res.status(410).json({
        error: 'Gone',
        message: `This meeting has been ${meeting.status.toLowerCase()} and cannot be joined`
      });
    }

    // Check if participant already registered (idempotent for authenticated users)
    if (participantUserId) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM public.meeting_participants
         WHERE meeting_id = $1 AND user_id = $2`,
        [body.meetingId, participantUserId]
      );
      if (existing.length > 0) {
        // Already registered — return existing
        const { rows: partRows } = await pool.query(
          `SELECT mp.id, mp.meeting_id, mp.user_id, mp.external_name, mp.created_at,
                  m.title, m.jitsi_room_name
           FROM public.meeting_participants mp
           JOIN public.meetings m ON m.id = mp.meeting_id
           WHERE mp.id = $1`,
          [existing[0].id]
        );
        return res.json({ data: partRows[0] });
      }
    }

    // Insert participant
    const { rows: participantRows } = await pool.query(
      `INSERT INTO public.meeting_participants (meeting_id, user_id, external_name)
       VALUES ($1, $2, $3)
       RETURNING id, meeting_id, user_id, external_name, created_at`,
      [body.meetingId, participantUserId, participantExternalName]
    );

    // Return combined response
    res.status(201).json({
      data: {
        ...participantRows[0],
        title: meeting.title,
        jitsi_room_name: meeting.jitsi_room_name
      }
    });
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
