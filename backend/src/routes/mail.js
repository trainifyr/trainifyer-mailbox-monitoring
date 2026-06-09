const { Router } = require('express');
const { z } = require('zod');
const pool = require('../lib/pgPool');

const router = Router();

// --- Zod schemas ---

const sendMessageSchema = z.object({
  receiverId: z.string().uuid('receiverId must be a valid UUID'),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  body: z.string().min(1, 'Body is required').max(10000, 'Body too long')
});

const inboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

// --- Permission helper ---

// Checks batch-level mailbox permissions for a student.
// Throws a structured error object that should be returned as-is to the client.
async function checkMailboxPermissions(studentId) {
  // Find the student's batch via student_batches
  const { rows: sbRows } = await pool.query(
    `SELECT sb.batch_id
     FROM public.student_batches sb
     WHERE sb.student_id = $1
     LIMIT 1`,
    [studentId]
  );

  // If the student has no batch assignment, mailbox is inaccessible
  if (sbRows.length === 0) {
    const err = new Error('You are not assigned to any batch. Mailbox access requires a batch assignment.');
    err.statusCode = 403;
    err.code = 'MAILBOX_NO_BATCH';
    throw err;
  }

  const batchId = sbRows[0].batch_id;

  // Fetch batch settings
  const { rows: settingsRows } = await pool.query(
    `SELECT mailbox_enabled, student_to_student_messaging
     FROM public.batch_settings
     WHERE batch_id = $1`,
    [batchId]
  );

  // If no settings row exists, use defaults (mailbox_enabled: true, sts: false per WI-301 logic)
  const settings = settingsRows[0] || { mailbox_enabled: true, student_to_student_messaging: false };

  if (!settings.mailbox_enabled) {
    const err = new Error('Mailbox access is disabled for your batch');
    err.statusCode = 403;
    err.code = 'MAILBOX_DISABLED';
    throw err;
  }

  return { batchId, settings };
}

// Checks whether a user ID belongs to a student or admin role.
async function getUserRole(userId) {
  const { rows } = await pool.query(
    `SELECT role FROM public.users WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0) return null;
  return rows[0].role;
}

// --- GET /api/mail/inbox ---
// List messages received by the current user, newest first.
// Supports pagination via ?page=1&limit=50.
// Includes sender name and email for display.

router.get('/inbox', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const role = await getUserRole(userId);
    if (!role) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // For students, check mailbox permissions
    if (role === 'STUDENT') {
      try {
        await checkMailboxPermissions(userId);
      } catch (permErr) {
        return res.status(permErr.statusCode || 403).json({
          error: 'Forbidden',
          message: permErr.message,
          code: permErr.code
        });
      }
    }

    const query = inboxQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    // Get total count for pagination info
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.mail_messages
       WHERE receiver_id = $1`,
      [userId]
    );
    const total = countRows[0].total;

    // Fetch paginated results with sender info
    const { rows } = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id,
              m.subject, m.body, m.is_read, m.read_at, m.created_at,
              sender.email AS sender_email,
              sender.full_name AS sender_name,
              sender.role AS sender_role
       FROM public.mail_messages m
       JOIN public.users sender ON sender.id = m.sender_id
       WHERE m.receiver_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, query.limit, offset]
    );

    res.json({
      data: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
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

// --- GET /api/mail/sent ---
// List messages sent by the current user, newest first.
// Supports pagination via ?page=1&limit=50.
// Includes receiver name and email for display.

router.get('/sent', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const role = await getUserRole(userId);
    if (!role) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // For students, check mailbox permissions (sending implies mailbox is enabled)
    if (role === 'STUDENT') {
      try {
        await checkMailboxPermissions(userId);
      } catch (permErr) {
        return res.status(permErr.statusCode || 403).json({
          error: 'Forbidden',
          message: permErr.message,
          code: permErr.code
        });
      }
    }

    const query = inboxQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.mail_messages
       WHERE sender_id = $1`,
      [userId]
    );
    const total = countRows[0].total;

    const { rows } = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id,
              m.subject, m.body, m.is_read, m.read_at, m.created_at,
              receiver.email AS receiver_email,
              receiver.full_name AS receiver_name,
              receiver.role AS receiver_role
       FROM public.mail_messages m
       JOIN public.users receiver ON receiver.id = m.receiver_id
       WHERE m.sender_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, query.limit, offset]
    );

    res.json({
      data: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
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

// --- POST /api/mail/send ---
// Send a new message. Enforces permission checks:
//   - Sender must have a mock user ID (authenticated).
//   - If sender is a STUDENT:
//     - Their batch must have mailbox_enabled = true.
//     - If student_to_student_messaging = false, receiver must be an ADMIN.
//   - ADMIN can send to anyone regardless of settings.
//   - Self-messaging is prevented by the DB CHECK constraint (mail_messages_no_self_mail).

router.post('/send', async (req, res, next) => {
  try {
    const senderId = req.mockUserId;
    if (!senderId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const body = sendMessageSchema.parse(req.body);

    // Verify sender exists
    const senderRole = await getUserRole(senderId);
    if (!senderRole) {
      return res.status(404).json({ error: 'Not Found', message: 'Sender not found' });
    }

    // Verify receiver exists
    const receiverRole = await getUserRole(body.receiverId);
    if (!receiverRole) {
      return res.status(404).json({ error: 'Not Found', message: 'Receiver not found' });
    }

    // Prevent self-messaging (also enforced by DB CHECK constraint)
    if (senderId === body.receiverId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot send a message to yourself' });
    }

    // Permission checks for STUDENT senders
    if (senderRole === 'STUDENT') {
      try {
        const { settings } = await checkMailboxPermissions(senderId);

        // If student-to-student messaging is off, receiver must be an ADMIN
        if (!settings.student_to_student_messaging && receiverRole !== 'ADMIN') {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Student-to-student messaging is disabled for your batch. You can only message administrators.',
            code: 'STS_DISABLED'
          });
        }
      } catch (permErr) {
        return res.status(permErr.statusCode || 403).json({
          error: 'Forbidden',
          message: permErr.message,
          code: permErr.code
        });
      }
    }

    // Insert the message
    const { rows } = await pool.query(
      `INSERT INTO public.mail_messages (sender_id, receiver_id, subject, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sender_id, receiver_id, subject, body, is_read, read_at, created_at`,
      [senderId, body.receiverId, body.subject, body.body]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    // Foreign key violation — receiver does not exist
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Not Found', message: 'Sender or receiver not found' });
    }
    // Constraint violation — self-message (backup check)
    if (err.code === '23514' && err.constraint === 'mail_messages_no_self_mail') {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot send a message to yourself' });
    }
    next(err);
  }
});

// --- PATCH /api/mail/:id/read ---
// Mark a received message as read. Only the receiver can mark their own messages.

router.patch('/:id/read', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const { id } = req.params;

    // Verify the message exists and belongs to this user as receiver
    const { rows: existing } = await pool.query(
      `SELECT id, receiver_id, is_read
       FROM public.mail_messages
       WHERE id = $1`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Message not found' });
    }

    if (existing[0].receiver_id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only mark your own messages as read'
      });
    }

    if (existing[0].is_read) {
      // Already read — return as-is (idempotent)
      const { rows } = await pool.query(
        `SELECT id, sender_id, receiver_id, subject, body, is_read, read_at, created_at
         FROM public.mail_messages WHERE id = $1`,
        [id]
      );
      return res.json({ data: rows[0] });
    }

    const { rows } = await pool.query(
      `UPDATE public.mail_messages
       SET is_read = true, read_at = now()
       WHERE id = $1 AND receiver_id = $2
       RETURNING id, sender_id, receiver_id, subject, body, is_read, read_at, created_at`,
      [id, userId]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
