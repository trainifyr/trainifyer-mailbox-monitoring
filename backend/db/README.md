# Database (Supabase / PostgreSQL)

This folder holds the raw SQL DDL and verification queries for the
Trainifyer Mailbox Monitoring Platform.

## Files
- `schema.sql`   - DDL for all 9 base tables, enums, triggers, RLS-off block, and `list_public_tables()` RPC.
- `verify.sql`   - Manual queries to run inside the Supabase SQL editor.

## Apply the schema
From `backend/`:
1. Set `DATABASE_URL` in `backend/.env` to your Supabase transaction-pooler URL.
2. `npm run db:init`

## Verify the schema
From `backend/`:
- `npm run db:verify`   - automated checks (tables, RLS, FKs, supabase_user_id, triggers)
- Or open `verify.sql` in the Supabase SQL Editor and run each query manually.

## RLS is OFF
Row Level Security is intentionally disabled in this phase. It will be enabled
in Phase 8 (WI-804) along with RLS policies.
