# Advisor UI refresh

Based on the user-supplied LV Branding CHAT CHAT UI.pdf. Following user feedback, the advisor uses the full available workspace like /agents/, with an independent message scroll area and a bottom composer. Conversation history is a sidebar on desktop and a dismissible drawer on mobile. The supplied Ai-LV-Branding_Agent.svg is used in the header, welcome area and replies. Existing portal navigation, voice controls, editable drafts and authorization remain in use.

The supplied Loading-Agent.json is served at /animations/lv-advisor-loading.json and rendered while a response is pending. The existing lazy-loaded Lottie player respects reduced motion and has a text status fallback if loading fails.

Conversation switching is in-memory only, scoped to the mounted portal workspace. Starting or switching a conversation cancels a pending response and stops voice. Reloading clears the session. Search, image generation and permanent chat history shown or suggested in the reference are not implemented by this visual update.

Validation covers mobile overflow, session draft switching, voice dictation/navigation cleanup, unavailable speech fallback and loading-asset delivery. Real provider response timing should be checked after frontend deployment. No database migration or Edge Function update is needed.
