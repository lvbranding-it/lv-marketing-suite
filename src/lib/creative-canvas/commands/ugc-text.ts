import { compose, countOf, line, requiresSelection, text, textCommand } from "./builders";
import { countInput, type CommandDefinition, type CommandInput, type CommandValues, type UgcMode } from "./types";
import type { CreativeOperation } from "../types";

/**
 * The UGC commands that are only an instruction.
 *
 * The ones left on the roadmap are left there for a reason: `/ugcrepurpose` and
 * `/ugcsubtitles` need a transcript from an uploaded recording, `/ugcresize`
 * and `/ugcbroll` need to produce media, and `/ugcmatrix` and `/ugccampaign`
 * are orchestrations. None of those is a prompt away.
 */

const CREATOR_TRUTH = [
  "Work only from the supplied material. Do not invent experiences, results, quotes or details the creator did not provide.",
  "Where something is missing, say what is missing rather than filling it in.",
  "Keep the creator's own voice and vocabulary — this should read as them, not as an agency.",
].join(" ");

const CLAIM_RULES = [
  "Every claim must be traceable to the supplied evidence. Mark any claim that is not, and do not soften it into something that merely sounds safe.",
  "Flag anything touching health, finances, earnings, safety or measurable performance for human review before use.",
].join(" ");

const PLATFORM: CommandInput = {
  key: "platform", label: "Platform", type: "select", defaultValue: "reels", options: [
    { value: "reels", label: "Instagram Reels" }, { value: "tiktok", label: "TikTok" },
    { value: "shorts", label: "YouTube Shorts" }, { value: "paid", label: "Paid placement" },
  ],
};

const SUBJECT: CommandInput = { key: "subject", label: "What the video is about", type: "textarea", required: true };

/** A concept command: same shape, different narrative frame. */
const concept = (
  trigger: string, name: string, description: string, aliases: string[],
  frame: string, options: { mode?: UgcMode; extra?: CommandInput[]; claims?: boolean } = {},
): CommandDefinition => textCommand({
  trigger, category: "ugc", name, description, aliases,
  operation: "campaign_concept",
  ugcMode: options.mode ?? "either",
  safety: options.claims ? "attested_claim" : "standard",
  inputs: [SUBJECT, ...(options.extra ?? []), PLATFORM, countInput(3, 8, "Concepts")],
  instruction: (values) => compose(
    `Develop ${countOf(values, 3)} ${frame} concepts for vertical video about: ${text(values.subject)}.`,
    line("Platform", values.platform),
    "For each: the hook in the creator's own words · what happens on screen beat by beat · where the product appears · the close.",
    "Written so a creator with a phone could shoot it. No studio, no crew, no second take assumed.",
    options.mode === "creator" ? CREATOR_TRUTH : "",
    options.claims ? CLAIM_RULES : "",
  ),
});

const localiseResolver = (values: CommandValues): CreativeOperation =>
  values.direction === "es_en" ? "adapt_es_en" : "adapt_en_es";

export const UGC_TEXT_COMMANDS: CommandDefinition[] = [
  textCommand({
    trigger: "ugcconcepts", category: "ugc", name: "UGC concepts", aliases: ["creatorconcepts"],
    description: "Concepts developed from the campaign objective.",
    operation: "campaign_concept",
    inputs: [
      { key: "objective", label: "Campaign objective", type: "textarea", required: true },
      { key: "audience", label: "Audience", type: "text", required: true },
      PLATFORM, countInput(5, 10, "Concepts"),
    ],
    instruction: (values) => compose(
      `Develop ${countOf(values, 5)} UGC concepts. Objective: ${text(values.objective)}.`,
      `Audience: ${text(values.audience)}.`,
      line("Platform", values.platform),
      "For each: the format · the hook · what the creator does and says · why this one earns attention · what it would take to shoot.",
      "Vary the format genuinely — a demonstration, a story and a reaction are different things, not the same idea relabelled.",
    ),
  }),

  concept("ugcdemo", "Demonstration", "A product-demonstration concept.", ["demo"], "product demonstration", { claims: true }),
  concept("ugcunboxing", "Unboxing", "An unboxing sequence.", ["unboxing"], "unboxing"),
  concept("ugcproblemsolution", "Problem to solution", "A problem-to-solution narrative.", ["ugcproblemolution", "problemsolution"], "problem-to-solution"),
  concept("ugcobjection", "Objection", "Address a purchase objection head on.", ["objection"], "objection-handling", {
    extra: [{ key: "objection", label: "The objection", type: "text", required: true, placeholder: "Too expensive, won't work for me, tried it before…" }],
  }),
  concept("ugcfaq", "FAQ videos", "Customer questions turned into short videos.", ["faq", "questions"], "question-answering", {
    extra: [{ key: "questions", label: "The questions", type: "textarea", required: true, placeholder: "One per line — real ones people ask" }],
  }),
  concept("ugcreaction", "Reaction", "A reaction-style concept.", ["reaction"], "reaction"),
  concept("ugcdayinthelife", "Day in the life", "The product inside a real routine.", ["dayinthelife", "routine"], "day-in-the-life", { mode: "creator" }),
  concept("ugcvlog", "Vlog", "An informal vlog-style sequence.", ["vlog"], "vlog", { mode: "creator" }),

  textCommand({
    trigger: "ugcstorytime", category: "ugc", name: "Storytime", aliases: ["storytime"],
    description: "A personal-experience narrative, shaped from what actually happened.",
    ugcMode: "creator", safety: "attested_claim",
    inputs: [
      { key: "account", label: "What actually happened", type: "textarea", required: true,
        help: "The real experience in the creator's own words. This shapes real material and will not invent a story." },
      PLATFORM,
    ],
    instruction: (values) => compose(
      `Shape this real experience into a storytime for vertical video: ${text(values.account)}`,
      line("Platform", values.platform),
      "Structure it as: the hook that makes someone stay · the setup · the turn · what changed · the close.",
      "Use their words wherever they work, and mark anything you tightened. Do not add incidents, feelings or outcomes that are not in their account.",
      CREATOR_TRUTH, CLAIM_RULES,
    ),
  }),

  textCommand({
    trigger: "ugcbeforeafter", category: "ugc", name: "Before and after", aliases: ["beforeafter", "transformation"],
    description: "Plan a before-and-after that can actually be substantiated.",
    ugcMode: "creator", safety: "attested_claim",
    inputs: [
      { key: "result", label: "The actual result", type: "textarea", required: true, help: "What genuinely changed, for whom, over what period." },
      { key: "evidence", label: "Evidence for it", type: "textarea", required: true, help: "What can be shown or substantiated." },
      { key: "typical", label: "Is this typical?", type: "select", required: true, defaultValue: "unknown", options: [
        { value: "typical", label: "Typical of most users" },
        { value: "atypical", label: "Better than most see" },
        { value: "unknown", label: "We do not know" },
      ] },
      PLATFORM,
    ],
    instruction: (values) => compose(
      `Plan a before-and-after presentation. The result: ${text(values.result)}.`,
      `Evidence: ${text(values.evidence)}.`,
      `Whether this is typical: ${text(values.typical)}.`,
      line("Platform", values.platform),
      "Give the shot plan, what the creator says, and the exact qualifying wording that must appear on screen and in the caption.",
      "If the result is not typical, or we do not know, that must be stated plainly in the video itself, not only in the caption.",
      "Refuse to plan anything that implies a result the evidence does not support, and say what evidence would be needed instead.",
      CLAIM_RULES,
    ),
  }),

  textCommand({
    trigger: "ugcstoryboard", category: "ugc", name: "UGC storyboard", aliases: ["ugcbeats"],
    description: "A UGC script broken into shots and actions.",
    selection: requiresSelection("The script or concept to board"),
    inputs: [
      { key: "length", label: "Length", type: "select", defaultValue: "30", options: [
        { value: "15", label: "15 seconds" }, { value: "30", label: "30 seconds" }, { value: "60", label: "60 seconds" },
      ] },
    ],
    instruction: (values) => compose(
      `Break the selected script into shots for a ${text(values.length)}-second vertical video.`,
      "One row per shot: timecode · framing · what the creator does · what they say · on-screen text · why the shot exists.",
      "Assume a phone, one pair of hands and natural light. Nothing that needs a second person unless the script already has one.",
    ),
  }),

  textCommand({
    trigger: "ugcshotlist", category: "ugc", name: "UGC shot list", aliases: ["creatorshots"],
    description: "The vertical shots a creator needs to capture.",
    inputs: [
      { key: "concept", label: "The concept or script", type: "textarea", required: true },
      { key: "setting", label: "Where they are shooting", type: "text" },
    ],
    instruction: (values) => compose(
      `Build the shot list for: ${text(values.concept)}.`,
      line("Setting", values.setting),
      "One row per shot: what it shows · how to frame it vertically · roughly how long · must-have or nice-to-have.",
      "Include the coverage that saves an edit — a clean product shot, a hands-only insert, a few seconds of silence at the top and tail.",
    ),
  }),

  textCommand({
    trigger: "ugcvoiceover", category: "ugc", name: "Voiceover", aliases: ["vo", "voiceovercopy"],
    description: "Voiceover written to fit footage you already have.",
    selection: { types: [], min: 0, label: "Optional transcript or footage notes on the canvas" },
    inputs: [
      { key: "footage", label: "What the footage shows", type: "textarea", required: true,
        help: "Describe the shots and roughly how long each runs. Canvas cannot watch the video." },
      { key: "message", label: "What the voiceover has to land", type: "textarea", required: true },
      { key: "length", label: "Total length", type: "text", placeholder: "30 seconds" },
    ],
    instruction: (values) => compose(
      `Write voiceover copy to run over this footage: ${text(values.footage)}`,
      `It has to land: ${text(values.message)}.`,
      line("Total length", values.length),
      "Lay it out against the footage — which line runs over which shot, with an approximate word count so it actually fits.",
      "Written to be spoken, not read. Leave room for the footage to carry a beat on its own.",
    ),
  }),

  textCommand({
    trigger: "ugcvariants", category: "ugc", name: "UGC variants", aliases: ["ugcalternatives"],
    description: "Hook, CTA or audience variations of an approved piece.",
    selection: requiresSelection("The approved script or concept"),
    inputs: [
      { key: "vary", label: "What to vary", type: "select", required: true, defaultValue: "hook", options: [
        { value: "hook", label: "The opening hook" }, { value: "cta", label: "The call to action" },
        { value: "audience", label: "The audience it speaks to" }, { value: "length", label: "The length" },
      ] },
      countInput(5, 10, "Variants"),
    ],
    instruction: (values) => compose(
      `Produce ${countOf(values, 5)} variants of the selected piece, varying: ${text(values.vary)}.`,
      "Everything else stays as approved — same claims, same product moment, same structure.",
      "Number them and say what each one tests, so results can be read afterwards.",
    ),
  }),

  textCommand({
    trigger: "ugclocalize", category: "ugc", name: "Localise", aliases: ["ugclocalise", "ugcspanish"],
    description: "Carry a concept between English- and Spanish-speaking markets.",
    selection: requiresSelection("The concept, script or caption to adapt"),
    operation: "adapt_en_es",
    inputs: [
      { key: "direction", label: "Direction", type: "select", required: true, defaultValue: "en_es", options: [
        { value: "en_es", label: "English → Spanish" }, { value: "es_en", label: "Spanish → English" },
      ] },
      { key: "market", label: "Market", type: "text", placeholder: "US Hispanic, Mexico, Spain…" },
    ],
    instruction: (values) => compose(
      "Adapt the selected UGC for the other market.",
      line("Market", values.market),
      "Carry the intent, the register and the cultural fit — not the words. A hook that only works in one language should be replaced, not translated.",
      "Say what you changed and why, and flag anything that would need a different creator or a different setting to be credible there.",
    ),
  }),

  textCommand({
    trigger: "ugcscorecard", category: "ugc", name: "Scorecard", aliases: ["score", "ugcscore"],
    description: "Score an asset against criteria you define.",
    operation: "visual_critique",
    selection: requiresSelection("The asset to score"),
    inputs: [
      { key: "criteria", label: "Criteria", type: "textarea", required: true, placeholder: "One per line — hook strength, clarity, authenticity, product moment, CTA…" },
      { key: "weights", label: "What matters most", type: "text" },
    ],
    instruction: (values) => compose(
      `Score the selected asset against these criteria: ${text(values.criteria)}.`,
      line("What matters most", values.weights),
      "Score each out of five with the evidence for the score — point at what is actually in the piece.",
      "Give the total, the weakest criterion, and the single change that would raise the score most.",
      "Do not round everything to the middle. A scorecard where nothing scores badly has measured nothing.",
    ),
  }),
];

// `/ugclocalize` changes capability with its direction, the same way
// `/bilingualadapt` does.
const localise = UGC_TEXT_COMMANDS.find((command) => command.id === "ugclocalize");
if (localise) localise.resolveOperation = localiseResolver;
