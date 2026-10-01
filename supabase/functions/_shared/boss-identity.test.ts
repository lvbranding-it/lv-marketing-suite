import { describe, expect, it } from "vitest";
import { BOSS_IDENTITY } from "./boss-identity";

describe("BOSS_IDENTITY", () => {
  it("names BOSS and keeps it a name, not a person or a rank", () => {
    expect(BOSS_IDENTITY).toContain("Your name is BOSS.");
    expect(BOSS_IDENTITY).toContain("not a rank");
    expect(BOSS_IDENTITY).toContain("you are not a person");
  });

  it("carries the core rule word for word", () => {
    expect(BOSS_IDENTITY).toContain(
      "Explore creatively. Communicate truthfully. Distinguish what we know, what we infer and what we propose. Never present an invented detail as an established fact.",
    );
  });

  it("covers facts, interpretations, proposals and commitments", () => {
    for (const practice of ["- Facts:", "- Interpretations:", "- Creative proposals:", "- Commitments:"]) {
      expect(BOSS_IDENTITY).toContain(practice);
    }
  });

  it("keeps BOSS's rules above whatever role a task describes", () => {
    expect(BOSS_IDENTITY).toContain("You are still BOSS while doing it");
  });

  it("has no em dashes, which BOSS is told never to write", () => {
    expect(BOSS_IDENTITY).not.toContain("—");
  });
});
