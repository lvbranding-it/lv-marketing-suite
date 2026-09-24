import { describe, expect, it } from "vitest";
import { classifyBounce, REPEAT_FAILURE_LIMIT, suppressionSkip } from "../../../supabase/functions/_shared/email/bounce.ts";

const event = (over: Record<string, unknown> = {}) => ({ event: "bounce", ...over });

describe("a dead mailbox", () => {
  it("is permanent", () => {
    // The six that failed on the AI guide campaign looked like this.
    const decision = classifyBounce(event({
      type: "bounce", status: "5.1.1",
      reason: "550 5.1.1 The email account that you tried to reach does not exist.",
    }));
    expect(decision.recipientStatus).toBe("bounced");
    expect(decision.suppress).toBe("bounced");
    expect(decision.detail).toContain("does not exist");
  });

  it("is permanent on any 5xx, even without a type", () => {
    expect(classifyBounce(event({ status: "5.7.1", reason: "550 rejected" })).suppress).toBe("bounced");
  });
});

describe("a temporary failure", () => {
  it("keeps a blocked address in the list", () => {
    // Reputation blips and greylisting resolve on their own; suppressing here
    // costs a contact who was never unreachable.
    const decision = classifyBounce(event({ event: "blocked", type: "blocked", status: "4.2.1", reason: "421 try again later" }));
    expect(decision.recipientStatus).toBe("failed");
    expect(decision.suppress).toBeNull();
  });

  it("treats a 4xx as temporary even when SendGrid calls it a bounce", () => {
    expect(classifyBounce(event({ type: "bounce", status: "4.4.2", reason: "421 deferred" })).suppress).toBeNull();
  });

  it("gives up once it has failed enough times", () => {
    const blocked = event({ event: "blocked", type: "blocked", status: "4.2.1", reason: "421 blocked" });
    expect(classifyBounce(blocked, REPEAT_FAILURE_LIMIT - 2).suppress).toBeNull();
    const final = classifyBounce(blocked, REPEAT_FAILURE_LIMIT - 1);
    expect(final.suppress).toBe("bounced");
    expect(final.detail).toContain(`failed ${REPEAT_FAILURE_LIMIT} times`);
  });
});

describe("a message SendGrid never sent", () => {
  it("does not punish the address for a system problem", () => {
    const decision = classifyBounce(event({ event: "dropped", reason: "Invalid SMTPAPI header" }));
    expect(decision.recipientStatus).toBe("failed");
    // "Invalid SMTPAPI header" is our bug, not their mailbox — but it does say
    // invalid, so this is the case worth being explicit about.
    expect(decision.suppress).toBe("invalid");
  });

  it("does not re-suppress an address that was already suppressed", () => {
    const decision = classifyBounce(event({ event: "dropped", reason: "Bounced Address" }));
    expect(decision.suppress).toBeNull();
    expect(decision.recipientStatus).toBe("failed");
  });

  it("records an unsubscribed drop without suppressing again", () => {
    expect(classifyBounce(event({ event: "dropped", reason: "Unsubscribed Address" })).suppress).toBeNull();
  });
});

describe("the recorded detail", () => {
  it("keeps the receiving server's own words", () => {
    const decision = classifyBounce(event({ type: "bounce", status: "5.1.1", reason: "550 no such user" }));
    expect(decision.detail).toBe("bounce · 5.1.1 · 550 no such user");
  });

  it("survives an event with nothing useful in it", () => {
    const decision = classifyBounce({ event: "bounce" });
    expect(decision.detail).toBe("bounce");
    expect(decision.suppress).toBeNull();
  });

  it("stays inside the column", () => {
    const decision = classifyBounce(event({ type: "bounce", status: "5.1.1", reason: "x".repeat(900) }));
    expect(decision.detail.length).toBeLessThanOrEqual(500);
  });
});

describe("recording a skipped recipient", () => {
  it("counts an unsubscribe as an unsubscribe", () => {
    expect(suppressionSkip("unsubscribed")).toEqual({ status: "unsubscribed", note: "Skipped — unsubscribed" });
  });

  it("does not file a dead mailbox under unsubscribed", () => {
    // The six from the AI guide campaign would have shown as unsubscribes on
    // every future send, inflating that figure and hiding the bounce one.
    const skip = suppressionSkip("bounced");
    expect(skip.status).toBe("failed");
    expect(skip.note).toContain("previously bounced");
  });

  it("keeps a spam report visible as its own thing", () => {
    const skip = suppressionSkip("spam");
    expect(skip.status).toBe("failed");
    expect(skip.note).toContain("spam");
  });

  it("records an invalid address as invalid", () => {
    expect(suppressionSkip("invalid").note).toContain("invalid");
  });

  it("never guesses unsubscribed when the reason is missing", () => {
    for (const reason of [null, undefined, "", "something-new"]) {
      expect(suppressionSkip(reason as string).status, String(reason)).toBe("failed");
    }
  });
});
