import { compose, countOf, line, PERSON_ADVICE_RULES, personCommand, requiresPhoto, text, textCommand } from "./builders";
import { countInput, type CommandDefinition, type CommandInput } from "./types";

/**
 * People & Style, written advice only.
 *
 * These produce styling direction in words. The commands that generate pictures
 * of someone are a separate job, tuned against real generations.
 *
 * Every one of them carries `PERSON_ADVICE_RULES`, whether or not a photograph
 * is attached. The consent gate is narrower on purpose: it applies to the five
 * that require a photo, because that gate exists for using someone's image, and
 * asking for permission to make a packing list would be friction that teaches
 * people to click past it.
 */

/** Optional supporting pictures — the person, their clothes, or references. */
const OPTIONAL_PHOTOS: CommandInput[] = [];
const optionalPhotoSelection = { types: [], min: 0, label: "Optional photos — the person, their wardrobe or references" };

const GOALS: CommandInput = {
  key: "goals", label: "What they want", type: "textarea", required: true,
  placeholder: "How they want to come across, what they like, what they will not wear…",
};

const CONTEXT: CommandInput = {
  key: "context", label: "Context", type: "text",
  placeholder: "Their work, their city, the climate, how formal their world is…",
};

const lookCommand = (
  trigger: string, name: string, description: string,
  aliases: string[], inputs: CommandInput[],
  instruction: (values: Record<string, unknown>) => string,
): CommandDefinition => textCommand({
  trigger, category: "people", name, description, aliases,
  selection: optionalPhotoSelection,
  operation: "recommend_direction",
  inputs: [...OPTIONAL_PHOTOS, ...inputs],
  instruction: (values) => compose(instruction(values), PERSON_ADVICE_RULES),
});

export const PEOPLE_COMMANDS: CommandDefinition[] = [
  // ── Reads a photograph of the person: consent gate applies ───────────────
  personCommand({
    trigger: "fitprofile", category: "people", name: "Fit profile", aliases: ["bodytype", "fit"],
    description: "Cuts and proportions that suit, from visible fit and stated preference.",
    inputs: [GOALS, CONTEXT],
    instruction: (values) => compose(
      "Recommend garment cuts and proportions for the person in the photograph.",
      `What they want: ${text(values.goals)}.`,
      line("Context", values.context),
      "Work from how their current clothes actually fit — where they pull, gape, bunch or hang well — and from what they have said they want.",
      "Give the recommendation as: cuts that will work and why · proportions and lengths to aim for · what to have altered · what to try before buying.",
      "Frame everything as what flatters the clothes on them, never as a correction of their body.",
      PERSON_ADVICE_RULES,
    ),
  }),

  personCommand({
    trigger: "facestylingmap", category: "people", name: "Face styling map", aliases: ["faceanalysis", "facemap"],
    description: "Eyewear, hair and grooming shapes that work with visible geometry.",
    inputs: [GOALS],
    instruction: (values) => compose(
      "Recommend eyewear, hair and grooming shapes for the person in the photograph.",
      `What they want: ${text(values.goals)}.`,
      "Work from visible geometry — the proportions and lines that are actually there — and say which shapes sit well against them and why.",
      "Cover frame shapes and widths, hair length and volume, and any facial-hair shape if relevant.",
      "Describe what harmonises. Never describe a feature as a flaw and never suggest anything is being disguised or corrected.",
      PERSON_ADVICE_RULES,
    ),
  }),

  personCommand({
    trigger: "coloranalysis", category: "people", name: "Colour analysis", aliases: ["colouranalysis", "colors", "palette"],
    description: "A wearable palette drawn from visible colouring.",
    inputs: [GOALS],
    instruction: (values) => compose(
      "Build a wearable colour palette for the person in the photograph.",
      line("What they want", values.goals),
      "Work from visible colouring in the image, noting that lighting and white balance affect what you can see — say where you are unsure rather than asserting.",
      "Give: the core palette with names and approximate HEX values · which of those go near the face · accent colours · combinations to avoid and why · neutrals that work as a base.",
      "This is about which colours sit well beside their colouring. Do not describe skin, hair or eyes in terms that classify the person.",
      PERSON_ADVICE_RULES,
    ),
  }),

  personCommand({
    trigger: "stylebook", category: "people", name: "Style book", aliases: ["styleguide", "personalstyle"],
    description: "A personal style guide they can actually shop from.",
    operation: "campaign_concept",
    selection: requiresPhoto("Photos of the person, and references if any"),
    inputs: [GOALS, CONTEXT, { key: "budget", label: "Budget posture", type: "text", placeholder: "Building slowly · investing in a few pieces · replacing a wardrobe" }],
    instruction: (values) => compose(
      "Write a personal style guide for the person in the supplied photographs.",
      `What they want: ${text(values.goals)}.`,
      line("Context", values.context),
      line("Budget", values.budget),
      "Structure it as: the direction in one paragraph · the palette · silhouettes and cuts that work · the pieces to own, in priority order · how to put them together for three real situations · what to stop buying.",
      "Written so they could take it into a shop. Specific garments and specific colours, not adjectives.",
      PERSON_ADVICE_RULES,
    ),
  }),

  personCommand({
    trigger: "styleprofile", category: "people", name: "Style profile", aliases: ["profile"],
    description: "A reusable style context other commands can build on.",
    inputs: [GOALS, CONTEXT],
    instruction: (values) => compose(
      "Build a reusable style profile for this person, to be reused as context by later commands.",
      `What they want: ${text(values.goals)}.`,
      line("Context", values.context),
      "Set it out as short labelled fields: palette · silhouettes · formality range · fabrics and textures · things they will not wear · fit preferences · the impression they want to make.",
      "Keep it factual and reusable. No prose, no flattery — this is a record, not a write-up.",
      PERSON_ADVICE_RULES,
    ),
  }),

  // ── Reasons about clothes and plans; a photo is optional ─────────────────
  textCommand({
    trigger: "wardrobeaudit", category: "people", name: "Wardrobe audit", aliases: ["audit", "closetaudit"],
    description: "Coverage, repetition and gaps in what they already own.",
    selection: optionalPhotoSelection,
    operation: "visual_critique",
    inputs: [
      { key: "wardrobe", label: "What they own", type: "textarea", required: true, placeholder: "List it, or select photos of the wardrobe on the canvas" },
      { key: "life", label: "What their week actually looks like", type: "textarea", required: true, placeholder: "Days at a desk, client dinners, site visits, weekends…" },
    ],
    instruction: (values) => compose(
      "Audit this wardrobe against the life it has to dress.",
      `What they own: ${text(values.wardrobe)}.`,
      `Their week: ${text(values.life)}.`,
      "Report: what is covered well · what is duplicated · what is missing for situations that actually recur · what is never worn and why that might be.",
      "Judge the wardrobe against their life, not against a standard. A gap only matters if their week creates it.",
      PERSON_ADVICE_RULES,
    ),
  }),

  textCommand({
    trigger: "capsulewardrobe", category: "people", name: "Capsule wardrobe", aliases: ["capsule"],
    description: "A small coordinated set that covers most of a life.",
    selection: optionalPhotoSelection,
    operation: "recommend_direction",
    inputs: [
      { key: "life", label: "What it has to cover", type: "textarea", required: true },
      { key: "palette", label: "Palette to work in", type: "text" },
      countInput(20, 40, "Pieces"),
    ],
    instruction: (values) => compose(
      `Build a capsule wardrobe of about ${countOf(values, 20)} pieces covering: ${text(values.life)}.`,
      line("Palette", values.palette),
      "List every piece with its colour and role, then show the combinations it produces and roughly how many distinct outfits that is.",
      "Everything must work with at least three other pieces. Cut anything that does not, and say what you cut.",
      PERSON_ADVICE_RULES,
    ),
  }),

  textCommand({
    trigger: "closetupgrade", category: "people", name: "Closet upgrade", aliases: ["upgrade", "additions"],
    description: "The few additions that change the most.",
    selection: optionalPhotoSelection,
    operation: "recommend_direction",
    inputs: [
      { key: "wardrobe", label: "What they own now", type: "textarea", required: true },
      { key: "budget", label: "Budget", type: "text" },
      countInput(8, 15, "Additions"),
    ],
    instruction: (values) => compose(
      `Recommend ${countOf(values, 8)} additions to this wardrobe: ${text(values.wardrobe)}.`,
      line("Budget", values.budget),
      "Order them by how much each one unlocks. For each: the piece, why it is next, and how many new outfits it creates with what they already own.",
      "Prefer one piece that unlocks six outfits over six pieces that unlock one each.",
      PERSON_ADVICE_RULES,
    ),
  }),

  // ── Look planning, written as direction ──────────────────────────────────
  lookCommand("outfitstyles", "Outfit directions", "Outfit directions for an occasion, profession or aesthetic.",
    ["outfits", "styledirections"],
    [{ key: "brief", label: "Occasion, profession or aesthetic", type: "textarea", required: true }, CONTEXT, countInput(5, 10, "Directions")],
    (values) => compose(
      `Develop ${countOf(values as never, 5)} outfit directions for: ${text(values.brief)}.`,
      line("Context", values.context),
      "For each: a name, the pieces and colours, why it fits the brief, and where it would be wrong.",
    )),

  lookCommand("occasionlook", "Occasion look", "A look planned for one specific event.",
    ["event", "eventlook"],
    [{ key: "occasion", label: "The event", type: "textarea", required: true, placeholder: "What it is, where, what time, who else is there, how formal" },
     { key: "wardrobe", label: "What they already own", type: "textarea" }],
    (values) => compose(
      `Plan a look for: ${text(values.occasion)}.`,
      line("Already owns", values.wardrobe),
      "Give the look head to toe with colours and fabrics, the reasoning, one alternative if the weather or mood turns, and what to avoid at this kind of event.",
    )),

  lookCommand("professionallook", "Professional look", "Wardrobe options for how someone wants to be read at work.",
    ["worklook", "business"],
    [{ key: "role", label: "Role and industry", type: "text", required: true },
     { key: "impression", label: "How they want to be read", type: "textarea", required: true },
     { key: "formality", label: "How formal their world is", type: "text" }],
    (values) => compose(
      `Develop professional wardrobe options for a ${text(values.role)}.`,
      `How they want to be read: ${text(values.impression)}.`,
      line("Formality of their world", values.formality),
      "Give three registers — everyday, client-facing and the highest-stakes day — with the pieces for each and what signals what.",
    )),

  lookCommand("brandambassadorlook", "Ambassador look", "Align how someone looks with a brand or campaign.",
    ["ambassador", "talentlook"],
    [{ key: "brand", label: "Brand or campaign", type: "text", required: true },
     { key: "role", label: "Their role in it", type: "text" },
     { key: "guidelines", label: "Brand rules that apply", type: "textarea" }],
    (values) => compose(
      `Align this person's appearance with: ${text(values.brand)}.`,
      line("Their role", values.role),
      line("Brand rules", values.guidelines),
      "Give the direction, the palette it draws from the brand, the pieces, and what would put them visibly off-brand.",
      "Keep them recognisably themselves. A person dressed as a brand asset stops being persuasive.",
    )),

  lookCommand("accessorystyles", "Accessories", "Watches, jewellery, ties, scarves and the rest.",
    ["accessories", "jewelry", "jewellery"],
    [{ key: "brief", label: "What they are accessorising", type: "textarea", required: true }, { key: "own", label: "What they already own", type: "text" }],
    (values) => compose(
      `Recommend accessories for: ${text(values.brief)}.`,
      line("Already owns", values.own),
      "Cover metal and tone, scale against the outfit, how many pieces at once, and what to leave off.",
    )),

  lookCommand("shoestyles", "Footwear", "Shoes for the outfit, the occasion and the ground.",
    ["shoes", "footwear"],
    [{ key: "brief", label: "What they are for", type: "textarea", required: true }, { key: "own", label: "What they already own", type: "text" }],
    (values) => compose(
      `Recommend footwear for: ${text(values.brief)}.`,
      line("Already owns", values.own),
      "Cover style, colour, material and sole, what each pairs with, and what the ground and the weather rule out.",
    )),

  lookCommand("seasonalwardrobe", "Seasonal wardrobe", "The same wardrobe, adapted to season and place.",
    ["seasonal", "season"],
    [{ key: "season", label: "Season", type: "text", required: true },
     { key: "location", label: "Where", type: "text", required: true, placeholder: "Houston, Mexico City, the coast…" },
     { key: "wardrobe", label: "What they own", type: "textarea" }],
    (values) => compose(
      `Adapt the wardrobe for ${text(values.season)} in ${text(values.location)}.`,
      line("What they own", values.wardrobe),
      "Say what the climate there actually demands — humidity, sun, indoor air conditioning, rain — and what to layer, swap, store and add.",
    )),

  lookCommand("packinglist", "Packing list", "A trip's wardrobe, planned so it all works together.",
    ["packing", "travel"],
    [{ key: "trip", label: "The trip", type: "textarea", required: true, placeholder: "Where, how long, what happens each day, the weather" },
     { key: "luggage", label: "Luggage", type: "text", placeholder: "Carry-on only, one checked bag…" }],
    (values) => compose(
      `Plan the wardrobe for this trip: ${text(values.trip)}.`,
      line("Luggage", values.luggage),
      "Give the packing list by category with quantities, the outfits it produces day by day, and what to wear on the plane.",
      "Everything must earn its place — say what each piece does and cut what only does one thing.",
    )),
];
