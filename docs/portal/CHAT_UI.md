# Advisor UI refresh

Based on the user-supplied LV Branding CHAT CHAT UI.pdf. The advisor now includes a charcoal conversation sidebar, rounded light workspace, welcome panel and rounded composer. Existing portal navigation, voice controls, editable drafts and authorization remain in use.

The supplied Loading-Agent.json is served at /animations/lv-advisor-loading.json and rendered while a response is pending. The existing lazy-loaded Lottie player respects reduced motion and has a text status fallback if loading fails.

Conversation switching is in-memory only, scoped to the mounted portal workspace. Starting or switching a conversation cancels a pending response and stops voice. Reloading clears the session. Search, image generation and permanent chat history shown or suggested in the reference are not implemented by this visual update.

Validation covers mobile overflow, session draft switching, voice dictation/navigation cleanup, unavailable speech fallback and loading-asset delivery. Real provider response timing should be checked after frontend deployment. No database migration or Edge Function update is needed.
