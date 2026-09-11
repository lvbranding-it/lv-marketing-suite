import { compose, countOf, line, requiresSelection, text, textCommand } from "./builders";
import { countInput, type CommandDefinition } from "./types";

/**
 * Brand & Campaign, plus the two Photography commands that produce words.
 *
 * `/shotlist` and `/selectbest` sit in Photography because that is the work
 * they belong to, but neither makes a picture — one plans them and the other
 * judges them — so both run on the same pipeline as everything else here.
 */

export const BRAND_COMMANDS: CommandDefinition[] = [
  textCommand({
    trigger: "creativedirections", category: "brand", name: "Creative directions", aliases: ["directions", "territories"],
    description: "Distinct strategic territories, not variations on one idea.",
    operation: "campaign_concept",
    inputs: [
      { key: "objective", label: "What the work has to do", type: "textarea", required: true },
      { key: "audience", label: "Audience", type: "text", required: true },
      countInput(3, 6, "Directions"),
    ],
    instruction: (values, context) => compose(
      `Develop ${countOf(values, 3)} creative directions. Objective: ${text(values.objective)}.`,
      `Audience: ${text(values.audience)}.`,
      context.brandName ? line("Brand", context.brandName) : "",
      "For each: a name · the strategic thought · the visual narrative · the tone · what it would look like in practice · what it deliberately gives up.",
      "They must be genuinely different bets. If two could run side by side without anyone noticing a change of mind, one of them is not a direction.",
    ),
  }),

  textCommand({
    trigger: "brandcheck", category: "brand", name: "Brand check", aliases: ["checkbrand", "onbrand"],
    description: "Judge selected work against the brand's own rules.",
    operation: "visual_critique",
    selection: requiresSelection("The work to check"),
    inputs: [
      { key: "rules", label: "Rules to check against", type: "textarea", placeholder: "Leave empty to use the project's brand context." },
    ],
    instruction: (values) => compose(
      "Check the selected work against the brand's rules.",
      text(values.rules) ? `Rules: ${text(values.rules)}.` : "Use the supplied brand context as the rules.",
      "Go rule by rule: what it is, whether this work follows it, and the evidence in the work itself.",
      "Separate a real breach from a judgement call, and say which is which. Do not invent rules that were not supplied.",
    ),
  }),

  textCommand({
    trigger: "paletteextract", category: "brand", name: "Extract palette", aliases: ["extractcolors", "extractcolours"],
    description: "Read a colour system out of the selected work.",
    operation: "visual_critique",
    selection: requiresSelection("The artwork to read"),
    inputs: [
      { key: "use", label: "What the palette is for", type: "text", placeholder: "A website, a deck, a packaging range…" },
    ],
    instruction: (values) => compose(
      "Extract and organise the colour system in the selected work.",
      line("Intended use", values.use),
      "Give approximate HEX values with names, organised by role — primary, secondary, neutrals, accent — and say the proportion each occupies.",
      "Note that values read from an image are approximate and affected by compression and lighting; say so rather than presenting them as exact.",
      "Flag any pair that would fail contrast requirements for text.",
    ),
  }),

  textCommand({
    trigger: "paletteexplore", category: "brand", name: "Explore palettes", aliases: ["palettes", "coloroptions"],
    description: "Palette alternatives with a reason behind each.",
    inputs: [
      { key: "brief", label: "What the palette has to do", type: "textarea", required: true },
      { key: "anchor", label: "Colours that must stay", type: "text" },
      countInput(4, 8, "Palettes"),
    ],
    instruction: (values) => compose(
      `Develop ${countOf(values, 4)} palette options. Brief: ${text(values.brief)}.`,
      line("Fixed colours", values.anchor),
      "For each: a name, the colours with HEX values and roles, the strategic reason for it, and what it would feel wrong for.",
      "Check contrast for text use and say where each one needs care.",
    ),
  }),

  textCommand({
    trigger: "typographypairing", category: "brand", name: "Type pairing", aliases: ["typepairing", "fonts", "typography"],
    description: "Typeface combinations with roles and reasoning.",
    inputs: [
      { key: "brief", label: "What it has to communicate", type: "textarea", required: true },
      { key: "constraints", label: "Constraints", type: "text", placeholder: "Licensing, web performance, languages, existing faces…" },
      countInput(4, 8, "Pairings"),
    ],
    instruction: (values) => compose(
      `Develop ${countOf(values, 4)} typeface pairings. Brief: ${text(values.brief)}.`,
      line("Constraints", values.constraints),
      "For each: display face and body face with weights, why they work together, where each is used, and a fallback stack.",
      "Say which are freely licensed and which are not. Do not recommend a face without saying how it would be obtained.",
    ),
  }),

  textCommand({
    trigger: "campaignconcepts", category: "brand", name: "Campaign concepts", aliases: ["concepts", "platforms"],
    description: "Campaign platforms with the narrative behind each.",
    operation: "campaign_concept",
    inputs: [
      { key: "objective", label: "Objective", type: "textarea", required: true },
      { key: "audience", label: "Audience", type: "text", required: true },
      { key: "channels", label: "Where it runs", type: "text" },
      countInput(3, 6, "Concepts"),
    ],
    instruction: (values, context) => compose(
      `Develop ${countOf(values, 3)} campaign concepts. Objective: ${text(values.objective)}.`,
      `Audience: ${text(values.audience)}.`,
      line("Channels", values.channels),
      context.brandName ? line("Brand", context.brandName) : "",
      "For each: the platform idea · the line · the narrative · how it behaves across the channels · what makes it last more than one execution.",
      "A concept that only produces one ad is an ad, not a campaign. Say so if one of yours is.",
    ),
  }),

  textCommand({
    trigger: "visualsystem", category: "brand", name: "Visual system", aliases: ["designsystem", "system"],
    description: "One concept expanded into rules anyone could follow.",
    operation: "campaign_concept",
    selection: requiresSelection("The concept or key visual to expand"),
    inputs: [
      { key: "surfaces", label: "Where it has to work", type: "textarea", placeholder: "Social, out of home, packaging, web, print…" },
    ],
    instruction: (values) => compose(
      "Expand the selected concept into a repeatable visual system.",
      line("Surfaces", values.surfaces),
      "Cover: layout logic and grid · colour roles · typographic hierarchy · image treatment · the recurring device · spacing and scale rules · what the system forbids.",
      "Written so a designer who was not in the room could produce a new asset that clearly belongs.",
    ),
  }),

  textCommand({
    trigger: "compareconcepts", category: "brand", name: "Compare concepts", aliases: ["compare", "evaluate"],
    description: "Weigh directions against criteria that actually decide.",
    operation: "compare_concepts",
    selection: { types: [], min: 2, label: "The concepts to compare" },
    inputs: [
      { key: "criteria", label: "Criteria", type: "textarea", placeholder: "Leave empty to use the brief and brand context." },
      { key: "decision", label: "The decision this feeds", type: "text", placeholder: "What happens once it is made" },
    ],
    instruction: (values) => compose(
      "Compare the selected concepts.",
      text(values.criteria) ? `Criteria: ${text(values.criteria)}.` : "Judge them against the supplied brief and brand context.",
      line("The decision this feeds", values.decision),
      "Score each against each criterion with the evidence, then say which you would take and what would have to be true for you to change your mind.",
      "Do not split the difference. A comparison that recommends nothing has not compared anything.",
    ),
  }),

  textCommand({
    trigger: "finalartcheck", category: "brand", name: "Final art check", aliases: ["preflight", "finalcheck"],
    description: "The last pass before anything goes out.",
    operation: "visual_critique",
    selection: requiresSelection("The artwork to check"),
    inputs: [
      { key: "destination", label: "Where it is going", type: "text", required: true, placeholder: "Instagram feed, A4 print, a 6-sheet, an email header…" },
      { key: "mandatories", label: "Mandatories", type: "textarea", placeholder: "Logos, legal lines, offer terms, URLs…" },
    ],
    instruction: (values) => compose(
      `Check the selected artwork for release to: ${text(values.destination)}.`,
      line("Mandatories", values.mandatories),
      "Go through composition and hierarchy · copy, spelling and consistency · brand rules · every mandatory, present or missing · anything that will fail at the destination's size or crop.",
      "Report only what is actually wrong, each with where it is. End with a clear go or no-go and the reason.",
      "You are reading a rendering, not a production file — say what still needs checking at source.",
    ),
  }),

  // ── Photography, but words ───────────────────────────────────────────────
  textCommand({
    trigger: "shotlist", category: "photography", name: "Shot list", aliases: ["shots", "shootplan"],
    description: "The photographs a campaign still needs.",
    operation: "campaign_concept",
    inputs: [
      { key: "campaign", label: "The campaign", type: "textarea", required: true },
      { key: "have", label: "What already exists", type: "textarea", placeholder: "Select it on the canvas, or describe it" },
      { key: "constraints", label: "Shoot constraints", type: "text", placeholder: "Half a day, one location, no talent…" },
    ],
    instruction: (values) => compose(
      `Build the shot list for: ${text(values.campaign)}.`,
      line("Already have", values.have),
      line("Constraints", values.constraints),
      "One row per shot: subject · framing and orientation · lighting · what it is for · must-have or nice-to-have.",
      "Order it so the must-haves are shot first, and say what to drop if the day runs short.",
    ),
  }),

  textCommand({
    trigger: "selectbest", category: "photography", name: "Select best", aliases: ["cull", "pick", "bestof"],
    description: "Judge selected images against the brief and pick.",
    operation: "compare_concepts",
    selection: { types: [], min: 2, label: "The images to judge" },
    inputs: [
      { key: "use", label: "What they are for", type: "textarea", required: true },
      { key: "howmany", label: "How many to pick", type: "text", placeholder: "One hero · a set of three…" },
    ],
    instruction: (values) => compose(
      `Judge the selected images for: ${text(values.use)}.`,
      line("How many to pick", values.howmany),
      "Rank them. For each, say what it does well and what holds it back, pointing at what is actually in the frame.",
      "Name your pick and the runner-up, and say what would make the runner-up win.",
    ),
  }),
];
