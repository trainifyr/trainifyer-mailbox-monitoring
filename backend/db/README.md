# Database (Supabase / PostgreSQL)

This folder holds the raw SQL DDL and verification queries for the
Trainifyer Mailbox Monitoring Platform.

## Files
- `schema.sql`   - DDL for all 9 base tables, enums, triggers, and RLS enabling.
- `rls_policies.sql` - Granular security policies for all tables (WI-804).
- `verify.sql`   - Manual queries to run inside the Supabase SQL editor.

## Migration Order
1. `schema.sql` — Creates tables, enums, triggers, and enables RLS.
2. `rls_policies.sql` — Defines per-table RLS policies. **Must be run after schema.sql**.

## Apply the schema
From `backend/`:
1. Set `DATABASE_URL` in `backend/.env` to your Supabase transaction-pooler URL.
2. `npm run db:init`
3. Paste contents of `rls_policies.sql` into Supabase SQL Editor and run.

## Verify the schema
From `backend/`:
- `npm run db:verify`   - automated checks (tables, RLS, FKs, supabase_user_id, triggers)
- Or open `verify.sql` in the Supabase SQL Editor and run each query manually.
