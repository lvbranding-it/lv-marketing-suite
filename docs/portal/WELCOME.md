# Ambassador welcome

Invitation styling uses a surface variant of the shared language selector and a centered logo outside the card, increased from 42px to 44.1px.

Apply portal migration 202609080005_ambassador_welcome.sql after the preceding migrations, then deploy the frontend. A private table and atomic RPC claim record the first portal entry per representative account across devices and organizations. Browser writes to the marker table are revoked. Inactive/unrelated accounts, staff and administrators cannot claim the event. Preview does not call the RPC.

The welcome renders 32 LV-logo particles in five sizes for under five seconds. It does not intercept clicks, is hidden from assistive technology, and respects reduced motion. Timers are cleaned up on unmount. No external animation service or audio is used.

For existing representatives, this triggers on their first portal entry after activation, since historical first-login markers do not exist. The marker records eligibility being consumed, not guaranteed viewing: reduced motion, navigation or interruption can suppress the visual without replaying later.

Deployment: migration 202609080005 was applied to the linked Supabase project and recorded atomically in migration history. Frontend deployment remains required. Production welcome claims were not exercised, so no ambassador's first-welcome event was consumed during verification.
