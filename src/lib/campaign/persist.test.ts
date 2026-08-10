import { beforeEach, describe, expect, it } from "vitest";
import { clearState, emptyAnswers, loadState, saveState } from "./persist";
import { validateStep } from "./validate";

// The module talks to window.localStorage; vitest runs in node, so stub it.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const V1_KEY = "lv-campaign-calculator:v1";
const V2_KEY = "lv-campaign-calculator:v2";

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = { localStorage: storage };
});

/** A session saved before the taxonomy and readiness redesign. */
function writeV1(overrides?: Record<string, unknown>) {
  storage.setItem(V1_KEY, JSON.stringify({
    phase: "results",
    step: 5,
    answers: {
      profile: { businessType: "b2b", stage: "growing", reach: "regional", industry: "Retail & ecommerce", currency: "USD" },
      objective: "leads",
      scope: { durationDays: 90, customDuration: false, channels: ["google-search"], audience: "10k-100k", timeSensitive: false },
      readiness: { positioning: true, message: false, landingPage: true, captureFlow: true, tracking: false },
      financial: { mode: "budget", budgetTotal: 25_000 },
      ...overrides,
    },
  }));
}

describe("persistence and migration", () => {
  it("returns null when nothing is stored", () => {
    expect(loadState()).toBeNull();
  });

  it("migrates a v1 business type onto the new audience taxonomy", () => {
    writeV1();
    const state = loadState();
    expect(state?.answers.profile.audienceFocus).toBe("businesses");
    expect(state?.answers.profile.industry).toBe("Ecommerce and retail");
    expect(state?.answers.profile.stage).toBe("growing");
  });

  it("migrates v1 booleans onto readiness states", () => {
    writeV1();
    const r = loadState()?.answers.readiness;
    expect(r?.positioning).toBe("ready");
    expect(r?.message).toBeNull();
    // v1's single capture-flow answer covered both a form and a checkout.
    expect(r?.leadForm).toBe("ready");
    expect(r?.checkoutFlow).toBe("ready");
    // Components introduced after v1 start unanswered.
    expect(r?.successMetrics).toBeNull();
  });

  it("consumes the v1 record so the migration runs only once", () => {
    writeV1();
    loadState();
    expect(storage.getItem(V1_KEY)).toBeNull();
  });

  it("pulls a restored session back to the first step that no longer validates", () => {
    // v1 had no destination question, so step 3 can't pass after the redesign.
    writeV1();
    const state = loadState(validateStep);
    expect(state?.phase).toBe("steps");
    expect(state?.step).toBe(3);
  });

  it("keeps a restored session in place when every passed step still validates", () => {
    const answers = emptyAnswers();
    answers.profile = { audienceFocus: "consumers", stage: "new", reach: "local", industry: "Home services", currency: "USD" };
    answers.objective = "leads";
    answers.scope = { durationDays: 90, customDuration: false, channels: ["google-search"], audience: "10k-100k", timeSensitive: false };
    answers.destination = "landing-page";
    answers.financial = { ...answers.financial, mode: "budget", budgetTotal: 25_000 };
    saveState({ answers, step: 5, phase: "steps" });

    const state = loadState(validateStep);
    expect(state?.step).toBe(5);
    expect(state?.phase).toBe("steps");
    expect(state?.answers.profile.audienceFocus).toBe("consumers");
  });

  it("drops a v1 business type with no clean equivalent rather than guessing", () => {
    writeV1({ profile: { businessType: "event", stage: "new", reach: "local", industry: "Nonexistent industry", currency: "USD" } });
    const state = loadState();
    // "Event or experience" described a campaign type, not who they sell to.
    expect(state?.answers.profile.audienceFocus).toBeNull();
    expect(state?.answers.profile.industry).toBe("");
  });

  it("clears both the current and legacy records", () => {
    writeV1();
    storage.setItem(V2_KEY, JSON.stringify({ answers: emptyAnswers(), step: 2, phase: "steps" }));
    clearState();
    expect(storage.getItem(V1_KEY)).toBeNull();
    expect(storage.getItem(V2_KEY)).toBeNull();
  });
});
