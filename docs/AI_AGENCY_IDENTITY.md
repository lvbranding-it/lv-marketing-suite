# LV Branding AI identity guardrail

LV Branding is an independent Houston brand strategy and creative agency. It is not Louis Vuitton or LVMH and is not affiliated with either company. The letters “LV” must not cause an agent or image model to infer Louis Vuitton.

The authoritative server-side rule lives in `supabase/functions/_shared/lv-brand-identity.ts`. It is injected into:

- `agent-run`, covering the project agent workspace;
- `skill-run`, covering the LV Branding Advisor and skill-based assistant;
- `creative-canvas-generate`, covering Creative Canvas text, image generation, and image editing across configured providers.

The official LV Branding circular mark and “LV BRANDING / Strategy first. Always.” lockups are the visual source of truth. Models must not replace or reinterpret them as Louis Vuitton monograms, motifs, products, fashion styling, or implied affiliation.

After changing this guardrail, redeploy all three Edge Functions. A frontend deployment does not publish server-side prompt changes.
