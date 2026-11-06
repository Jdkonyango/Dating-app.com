# Meetday live setup

Meetday requires a verified account and a completed personal profile before any discovery, connections, or other app content is shown. Visitors see only the sign-in/sign-up gate; no demo profiles are accessible.

## Connect Supabase

The Supabase project URL is already set in `config.js`. Authentication will remain unavailable until the project owner completes these steps:

1. In that project, open **Project Settings → API Keys** and copy the **publishable** key (or legacy `anon` key) into `supabasePublishableKey` in `config.js`. This browser key is designed to be public. **Never put a service-role or secret key in this file or send one in chat.**
2. Open that project's SQL Editor and run all of `supabase-schema.sql`.
3. In **Authentication → URL Configuration**, set the Site URL to the HTTPS address where the app will be hosted and add that exact address to the allowed redirect URLs.
4. In **Authentication → Providers → Email**, configure email verification and a production email provider. Leave email confirmation enabled.
5. Host this folder on an HTTPS static host. Open `date.html`, create an account, verify the email, sign in, and complete your required personal profile. Each profile has its own unique username, private account email, editable bio/interests, and optional profile picture.

The browser imports the pinned Supabase JavaScript client from jsDelivr. The site therefore needs internet access. If the publishable key is blank, the app remains locked and sign-in/sign-up submissions explain how the service must be configured. A Supabase endpoint response by itself does not mean accounts or tables are ready; the key and SQL setup above are both required.

## Current safeguards and limitations

- Database row-level security restricts profile editing, likes, passes, matches, messages, blocks, and report submissions to the right signed-in user. Public discovery exposes only the intended profile fields through a database function.
- Each member has one account profile linked to their verified sign-in. Usernames are unique; account email is not included in discovery. Profile photos are stored in a private bucket with signed links for signed-in members only.
- Messages are available only for mutual matches. The UI renders profile and message text as text, not executable HTML. A database trigger applies a basic one-message-per-second limit.
- Age is self-declared and email verification is not identity verification. Do not launch to the public without a reliable age-assurance, moderation, report-response, account-deletion, privacy, and legal-compliance process.
- Reports are stored privately in the database, but this prototype does not provide a moderator dashboard, automated review, emergency response, or guarantee that reports are acted on.
- No location tracking, distance calculation, push notifications, or account-deletion flow is included. The profile city is public to signed-in members.
- Apply backups, abuse monitoring, data-retention policies, and appropriate Supabase project access controls before inviting real users.

Do not treat this sample schema as a substitute for a security and privacy review before a public launch.
