# Meetday live setup

Meetday requires a verified account and a completed personal profile before any discovery, connections, or other app content is shown. Visitors see only the sign-in/sign-up gate; no demo profiles are accessible.

## Connect Supabase

The Supabase project URL and publishable key are already set in `config.js`. The app's full database migration is `supabase/migrations/20261106213900_meetday_initial.sql`. Do not replace it with a minimal `profiles` table example: Meetday needs the migration's additional profile fields, matching and messaging tables, RPC functions, storage policies, and RLS. This migration also upgrades the basic `profiles(id, username, full_name, avatar_url, created_at)` shape. Existing profiles without the required age, city, intent, biography, and adult confirmation are kept inactive and private until their owners complete the Meetday profile; existing user IDs are preserved.

1. In Supabase, select the project whose URL matches `supabaseUrl` in `config.js`.
2. Open **SQL Editor → New query**. Open the complete migration file above in this repository, copy all of it, and paste it into the SQL Editor.
3. Click **Run** and wait for the query to finish successfully. If it reports an error, stop and resolve that error before retrying; do not run only part of the migration.
4. Verify the migration in the SQL Editor with:

   ```sql
   select
     to_regclass('public.profiles') as profiles_table,
     to_regclass('public.matches') as matches_table,
     coalesce((
       select relrowsecurity
       from pg_class
       where oid = to_regclass('public.profiles')
     ), false) as profiles_rls_enabled,
     to_regprocedure('public.get_my_profile()') as get_my_profile_function,
     pg_get_function_result('public.get_my_profile()') as get_my_profile_result_type,
     to_regprocedure('public.save_my_profile(text,text,integer,text,text,text,text[],text,boolean)') as save_profile_function,
     to_regprocedure('public.discover_profiles(text,text,boolean)') as discovery_function,
     to_regprocedure('public.get_my_matches()') as matches_function;
   ```

   The table and function results should be non-null, `get_my_profile_result_type` should be `jsonb`, and `profiles_rls_enabled` should be `true`. The migration also creates the likes, matches, messages, reports, and private avatar-storage objects required by the app.
5. In **Authentication → URL Configuration**, set the Site URL to the HTTPS address where the app will be hosted and add that exact address to the allowed redirect URLs.
6. In **Authentication → Providers → Email**, keep email confirmation enabled. Configure a custom SMTP provider under **Project Settings → Authentication → SMTP Settings** (or the matching SMTP section in the dashboard). Supabase's built-in mail service is intentionally rate-limited; if email sends are being throttled, configure SMTP first, then adjust the email limits under **Authentication → Rate Limits** within your mail provider's sending capacity. There is no safe unlimited-send setting, and the SMTP provider may apply its own limits. After hitting a limit, wait for the provider's window to reset before retrying.
7. Host this folder on an HTTPS static host. Open `date.html`, create an account, verify the email, sign in, and complete your required personal profile. Each profile has its own unique username, private account email, editable bio/interests, and optional profile picture.

The browser imports the pinned Supabase JavaScript client from jsDelivr. The site therefore needs internet access. A Supabase endpoint response by itself does not mean accounts or tables are ready; both the public browser key and successful migration are required.

## Current safeguards and limitations

- Database row-level security restricts profile editing, likes, passes, matches, messages, blocks, and report submissions to the right signed-in user. Public discovery exposes only the intended profile fields through a database function.
- Profile table access is not granted directly to browser clients; authenticated profile reads and writes go through user-scoped functions. The `profiles` RLS policy permits reading only the signed-in user's own row.
- Each member has one account profile linked to their verified sign-in. Usernames are unique; account email is not included in discovery. Profile photos are stored in a private bucket with signed links for signed-in members only.
- Messages are available only for mutual matches. The UI renders profile and message text as text, not executable HTML. A database trigger applies a basic one-message-per-second limit.
- Age is self-declared and email verification is not identity verification. Do not launch to the public without a reliable age-assurance, moderation, report-response, account-deletion, privacy, and legal-compliance process.
- Reports are stored privately in the database, but this prototype does not provide a moderator dashboard, automated review, emergency response, or guarantee that reports are acted on.
- No location tracking, distance calculation, push notifications, or account-deletion flow is included. The profile city is public to signed-in members.
- Apply backups, abuse monitoring, data-retention policies, and appropriate Supabase project access controls before inviting real users.

Do not treat this sample schema as a substitute for a security and privacy review before a public launch.
