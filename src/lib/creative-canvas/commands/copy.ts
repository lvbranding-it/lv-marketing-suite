import { compose, countOf, line, OPTIONAL_CONTEXT, requiresSelection, text, textCommand } from "./builders";
import { countInput, type CommandDefinition } from "./types";

/**
 * Copy & Strategy.
 *
 * All of these take what is selected, compose an instruction and put words back
 * on the canvas. No new capability, which is why they could be turned on as a
 * batch — the pipeline they use is the one `/headline` has been running on.
 */

const TONES = [
  { value: "confident", label: "Confident, plain" },
  { value: "warm", label: "Warm, human" },
  { value: "bold", label: "Bold, declarative" },
  { value: "editorial", label: "Editorial, considered" },
  { value: "playful", label: "Playful" },
  { value: "technical", label: "Technical, precise" },
];

const CHANNELS = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "email", label: "Email" },
  { value: "web", label: "Website" },
];

export const COPY_COMMANDS: CommandDefinition[] = [
  textCommand({
    trigger: "tagline", category: "copy", name: "Taglines", aliases: ["slogan", "strapline"],
    description: "Lines that can sit under the logo for years.",
    inputs: [
      { key: "brand", label: "Brand or campaign", type: "text", required: true },
      { key: "position", label: "What it should stand for", type: "textarea", required: true, placeholder: "The position this has to hold, not the features" },
      countInput(8, 15, "Options"),
    ],
    instruction: (values) => compose(
      `Write ${countOf(values, 8)} taglines for ${text(values.brand)}.`,
      `What it must stand for: ${text(values.position)}.`,
      "A tagline outlives a campaign, so avoid anything tied to an offer or a season. Number them, keep them under six words where you can, and vary the mechanism — a claim, a promise, an instruction, a turn of phrase.",
      "No rhyming for its own sake, and nothing that would fit any competitor equally well.",
    ),
  }),

  textCommand({
    trigger: "caption", category: "copy", name: "Captions", aliases: ["socialpost", "postcopy"],
    description: "Post copy written for one channel's conventions.",
    inputs: [
      { key: "subject", label: "What the post is about", type: "textarea", required: true },
      { key: "channel", label: "Channel", type: "select", required: true, defaultValue: "instagram", options: CHANNELS },
      { key: "tone", label: "Tone", type: "select", defaultValue: "warm", options: TONES },
      countInput(3, 8, "Options"),
    ],
    instruction: (values) => compose(
      `Write ${countOf(values, 3)} captions for ${text(values.channel)} about: ${text(values.subject)}.`,
      line("Tone", values.tone),
      "Match the channel's length and conventions. Vary the opening — not every one should start with a question.",
      "Hashtags only where the channel expects them, and only a handful. No emoji padding.",
    ),
  }),

  textCommand({
    trigger: "cta", category: "copy", name: "Calls to action", aliases: ["calltoaction"],
    description: "The line that asks for the click.",
    inputs: [
      { key: "action", label: "What you want people to do", type: "text", required: true },
      { key: "context", label: "Where it appears", type: "text", placeholder: "Button, end of a post, email footer…" },
      { key: "offer", label: "Reason to act now", type: "text" },
      countInput(8, 15, "Options"),
    ],
    instruction: (values) => compose(
      `Write ${countOf(values, 8)} calls to action for: ${text(values.action)}.`,
      line("Where it appears", values.context),
      line("Offer", values.offer),
      "Number them. Lead with the verb. Say what happens next, not how the reader should feel about it.",
      "No urgency the offer does not actually create.",
    ),
  }),

  textCommand({
    trigger: "adcopy", category: "copy", name: "Ad copy", aliases: ["ads", "advertising"],
    description: "Advertising variations built to be tested against each other.",
    inputs: [
      { key: "product", label: "Product or service", type: "text", required: true },
      { key: "audience", label: "Audience", type: "text", required: true },
      { key: "channel", label: "Channel", type: "select", defaultValue: "instagram", options: CHANNELS },
      { key: "angle", label: "Angles to cover", type: "text", placeholder: "Price, proof, problem, status, ease…" },
      countInput(5, 10, "Variations"),
    ],
    instruction: (values) => compose(
      `Write ${countOf(values, 5)} advertising variations for ${text(values.product)}, aimed at ${text(values.audience)}.`,
      line("Channel", values.channel),
      text(values.angle) ? `Cover these angles: ${text(values.angle)}.` : "Each variation must test a genuinely different angle, not a reworded version of the same one.",
      "Give each one a headline, body and CTA, and name the angle it is testing so results can be read afterwards.",
    ),
  }),

  textCommand({
    trigger: "brandvoice", category: "copy", name: "Brand voice", aliases: ["voice", "tovoice"],
    description: "Define how the brand sounds, or apply it to what is selected.",
    inputs: [
      { key: "mode", label: "Define or apply", type: "select", required: true, defaultValue: "define", options: [
        { value: "define", label: "Define the voice system" },
        { value: "apply", label: "Apply it to the selected copy" },
      ] },
      { key: "traits", label: "Traits it should have", type: "textarea", placeholder: "Direct without being cold, warm without being soft…" },
    ],
    instruction: (values, context) => values.mode === "apply"
      ? compose(
        "Rewrite the selected copy in the brand voice, keeping its meaning and length.",
        line("Traits", values.traits),
        context.brandName ? line("Brand", context.brandName) : "",
        "Show the original and the rewrite side by side, and name what changed in each — it is the difference that teaches the voice.",
      )
      : compose(
        "Define a brand voice system that a writer who has never met this client could use tomorrow.",
        line("Traits to build on", values.traits),
        context.brandName ? line("Brand", context.brandName) : "",
        "Give three to five traits. For each: what it means, what it sounds like, what it is often confused with, and a do-and-don't pair written as real sentences from this brand.",
        "Finish with the words this brand uses and the words it never does.",
      ),
  }),

  textCommand({
    trigger: "positioning", category: "copy", name: "Positioning", aliases: ["position"],
    description: "Distinct positions the brand could credibly hold.",
    operation: "recommend_direction",
    inputs: [
      { key: "brand", label: "Brand or product", type: "text", required: true },
      { key: "audience", label: "Audience", type: "text", required: true },
      { key: "competitors", label: "Competitive set", type: "textarea" },
      countInput(3, 6, "Positions"),
    ],
    instruction: (values) => compose(
      `Develop ${countOf(values, 3)} positioning options for ${text(values.brand)}, for ${text(values.audience)}.`,
      line("Competitive set", values.competitors),
      "For each: the position in one sentence, who it wins and who it gives up, what has to be true for it to hold, and the strongest argument against it.",
      "A position someone else could claim word for word is not a position. Say so if one of yours fails that test.",
    ),
  }),

  textCommand({
    trigger: "valueproposition", category: "copy", name: "Value proposition",
    aliases: ["valueroposition", "valueprop", "value"],
    description: "What the buyer gets, in terms they would use.",
    inputs: [
      { key: "product", label: "Product or service", type: "text", required: true },
      { key: "audience", label: "Who it is for", type: "text", required: true },
      { key: "alternatives", label: "What they do today instead", type: "text" },
    ],
    instruction: (values) => compose(
      `Write the value proposition for ${text(values.product)}, for ${text(values.audience)}.`,
      line("What they do instead today", values.alternatives),
      "Give the core statement, then the two or three proofs that make it believable, then the objection it has to survive.",
      "Write it in the buyer's words, not the seller's. Nothing that describes a feature and calls it a benefit.",
    ),
  }),

  textCommand({
    trigger: "creativebrief", category: "copy", name: "Creative brief", aliases: ["brief"],
    description: "A brief someone could actually work from.",
    operation: "campaign_concept",
    inputs: [
      { key: "objective", label: "Objective", type: "textarea", required: true, placeholder: "The change this work has to create" },
      { key: "audience", label: "Audience", type: "text", required: true },
      { key: "deliverables", label: "Deliverables", type: "textarea" },
      { key: "constraints", label: "Constraints", type: "textarea", placeholder: "Budget, legal, timing, mandatories…" },
    ],
    instruction: (values, context) => compose(
      "Write a creative brief.",
      line("Objective", values.objective),
      line("Audience", values.audience),
      line("Deliverables", values.deliverables),
      line("Constraints", values.constraints),
      context.brandName ? line("Brand", context.brandName) : "",
      "Structure it as: the business problem · what we want someone to do · who they are and what they currently believe · the single thought · why they should believe it · mandatories · deliverables · what success looks like.",
      "One page. If a section has no answer, write the question that has to be asked rather than inventing one.",
    ),
  }),

  textCommand({
    trigger: "rationale", category: "copy", name: "Rationale", aliases: ["why", "reasoning"],
    description: "The strategic case for the work that is selected.",
    operation: "creative_rationale",
    selection: requiresSelection("The work to explain"),
    inputs: [
      { key: "audience", label: "Who is reading this", type: "select", defaultValue: "client", options: [
        { value: "client", label: "The client" },
        { value: "internal", label: "Internal team" },
        { value: "creator", label: "A creator or partner" },
      ] },
    ],
    instruction: (values) => compose(
      "Explain the strategic logic behind the selected work.",
      line("Written for", values.audience),
      "Say what the work is doing and why that follows from the brief — the thinking, not a description of what can already be seen.",
      "Be honest about the trade-off it makes. Work that gives nothing up is usually work that decided nothing.",
    ),
  }),

  textCommand({
    trigger: "storyboard", category: "copy", name: "Storyboard", aliases: ["beats"],
    description: "A concept or script broken into visual beats.",
    inputs: [
      { key: "concept", label: "Concept or script", type: "textarea", required: true },
      { key: "length", label: "Length", type: "select", defaultValue: "30", options: [
        { value: "15", label: "15 seconds" }, { value: "30", label: "30 seconds" },
        { value: "60", label: "60 seconds" }, { value: "longer", label: "Longer form" },
      ] },
    ],
    instruction: (values) => compose(
      `Break this into visual beats for a ${text(values.length)}-second piece: ${text(values.concept)}.`,
      "One beat per row: timecode · what is on screen · camera · what is said or heard · why this beat exists.",
      "Written so a shot list could be built from it without asking follow-up questions.",
    ),
  }),

  textCommand({
    trigger: "script", category: "copy", name: "Script", aliases: ["videoscripting"],
    description: "Write or sharpen a video script.",
    inputs: [
      { key: "subject", label: "What it is about", type: "textarea", required: true },
      { key: "length", label: "Length", type: "select", defaultValue: "30", options: [
        { value: "15", label: "15 seconds" }, { value: "30", label: "30 seconds" },
        { value: "60", label: "60 seconds" }, { value: "120", label: "Two minutes" },
      ] },
      { key: "voice", label: "Who is speaking", type: "text", placeholder: "Founder, voiceover, two people…" },
    ],
    instruction: (values) => compose(
      `Write a ${text(values.length)}-second script about: ${text(values.subject)}.`,
      line("Speaker", values.voice),
      "Two columns: what is heard, what is seen. Mark the timecodes.",
      "Read it aloud in your head and cut whatever a person would not say. Front-load the reason to keep watching.",
    ),
  }),

  textCommand({
    trigger: "copyvariants", category: "copy", name: "Copy variants", aliases: ["variants", "alternatives"],
    description: "Controlled alternatives to the selected copy.",
    selection: requiresSelection("The copy to vary"),
    operation: "rewrite",
    inputs: [
      { key: "vary", label: "What should change", type: "text", required: true, placeholder: "Length, angle, tone, the opening…" },
      { key: "hold", label: "What must stay the same", type: "text", placeholder: "The claim, the offer, the CTA…" },
      countInput(5, 10, "Variants"),
    ],
    instruction: (values) => compose(
      `Write ${countOf(values, 5)} variants of the selected copy. Vary: ${text(values.vary)}.`,
      text(values.hold) ? `Hold constant: ${text(values.hold)}.` : "",
      "Number them and say in a few words what each one changes, so a test can be read afterwards.",
      "A variant that changes nothing meaningful is not a variant — do not pad the list to reach the number.",
    ),
  }),

  textCommand({
    trigger: "shorten", category: "copy", name: "Shorten", aliases: ["trim", "cut"],
    description: "Cut length without losing the point.",
    selection: requiresSelection("The copy to shorten"),
    operation: "shorten",
    inputs: [
      { key: "target", label: "Target length", type: "text", placeholder: "Half · under 100 characters · one sentence…" },
      { key: "keep", label: "What cannot be lost", type: "text" },
    ],
    instruction: (values) => compose(
      "Shorten the selected copy.",
      line("Target", values.target),
      line("Must survive", values.keep),
      "Keep the meaning and the voice. Cut words, not ideas — and if the only way to hit the target is to lose an idea, say which one and why.",
    ),
  }),

  textCommand({
    trigger: "expand", category: "copy", name: "Expand", aliases: ["develop", "lengthen"],
    description: "Develop a selected idea further.",
    selection: requiresSelection("The idea to develop"),
    operation: "expand",
    inputs: [
      { key: "direction", label: "Where to take it", type: "textarea", required: true },
      { key: "target", label: "Target length", type: "text" },
    ],
    instruction: (values) => compose(
      `Develop the selected idea further: ${text(values.direction)}.`,
      line("Target length", values.target),
      "Add substance, not words. Every new sentence must carry something the original did not.",
    ),
  }),

  textCommand({
    trigger: "tonechange", category: "copy", name: "Change tone", aliases: ["retone", "adjusttone"],
    description: "Adjust the voice without changing the message.",
    selection: requiresSelection("The copy to adjust"),
    operation: "rewrite",
    inputs: [
      { key: "tone", label: "New tone", type: "select", required: true, defaultValue: "warm", options: TONES },
      { key: "notes", label: "Anything specific", type: "text" },
    ],
    instruction: (values) => compose(
      `Rewrite the selected copy in a ${text(values.tone)} tone.`,
      line("Notes", values.notes),
      "The message, claims, offer and length stay as they are. Only the register changes.",
      "Show the original and the rewrite together so the difference can be judged.",
    ),
  }),

  textCommand({
    trigger: "proofread", category: "copy", name: "Proofread", aliases: ["proof", "grammar", "edit"],
    description: "Correct grammar, consistency and clarity.",
    selection: requiresSelection("The copy to proofread"),
    operation: "rewrite",
    inputs: [
      { key: "variant", label: "English variant", type: "select", defaultValue: "us", options: [
        { value: "us", label: "US English" }, { value: "uk", label: "UK English" }, { value: "es", label: "Spanish" },
      ] },
      { key: "style", label: "House style notes", type: "textarea", placeholder: "Oxford comma, sentence case headings, how the brand is written…" },
    ],
    instruction: (values) => compose(
      `Proofread the selected copy in ${text(values.variant) === "es" ? "Spanish" : text(values.variant) === "uk" ? "UK English" : "US English"}.`,
      line("House style", values.style),
      "Give the corrected text first, then a list of what you changed and why — grammar, consistency and clarity separately.",
      "Do not rewrite for style unless it is actually wrong. Flag anything ambiguous rather than guessing what was meant.",
    ),
  }),

  textCommand({
    trigger: "contentseries", category: "copy", name: "Content series", aliases: ["series", "contentplan"],
    description: "One idea expanded into a run of pieces.",
    operation: "campaign_concept",
    inputs: [
      { key: "idea", label: "The core idea", type: "textarea", required: true },
      { key: "channel", label: "Channel", type: "select", defaultValue: "instagram", options: CHANNELS },
      countInput(6, 12, "Pieces"),
    ],
    instruction: (values) => compose(
      `Expand this into a series of ${countOf(values, 6)} pieces for ${text(values.channel)}: ${text(values.idea)}.`,
      "For each: the angle, the hook, what it covers, and what it leaves for the next one.",
      "A series is not the same post six ways — each piece must be worth seeing on its own and better in sequence.",
    ),
  }),

  textCommand({
    trigger: "campaignmatrix", category: "copy", name: "Campaign matrix", aliases: ["matrix", "testplan"],
    description: "Audience, message, channel and variation mapped out.",
    operation: "campaign_concept",
    inputs: [
      { key: "campaign", label: "Campaign", type: "text", required: true },
      { key: "audiences", label: "Audiences", type: "textarea", required: true, placeholder: "One per line" },
      { key: "channels", label: "Channels", type: "text", placeholder: "Instagram, paid social, email…" },
    ],
    instruction: (values) => compose(
      `Map the campaign matrix for: ${text(values.campaign)}.`,
      `Audiences: ${text(values.audiences)}.`,
      line("Channels", values.channels),
      "Lay it out as a table: audience · what they currently believe · the message · channel · creative variation · the CTA.",
      "Then say which cells are the real test and which are filler, because a matrix that treats every cell as equally important tests nothing.",
    ),
  }),
];
