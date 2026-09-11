import { describe, expect, it } from "vitest";
import { collectInheritedContext, MAX_INHERITED_NODES, sequencePath, sequencePosition } from "./graph";

const edge = (source: string, target: string) => ({ source, target });

describe("collectInheritedContext", () => {
  it("pulls in what points at the selection", () => {
    // direction → product: selecting the product inherits the direction.
    const found = collectInheritedContext([edge("direction", "product")], ["product"]);
    expect(found).toEqual([{ id: "direction", depth: 1, into: "product" }]);
  });

  it("does not travel the wrong way down an arrow", () => {
    // Selecting the direction must not drag in everything it informs.
    expect(collectInheritedContext([edge("direction", "product")], ["direction"])).toEqual([]);
  });

  it("follows a chain and records how far each hop is", () => {
    const edges = [edge("brand", "direction"), edge("direction", "product")];
    const found = collectInheritedContext(edges, ["product"]);
    expect(found.map((item) => [item.id, item.depth])).toEqual([["direction", 1], ["brand", 2]]);
  });

  it("stops at the configured depth", () => {
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d"), edge("d", "e")];
    const found = collectInheritedContext(edges, ["e"], { maxDepth: 2 });
    expect(found.map((item) => item.id)).toEqual(["d", "c"]);
  });

  it("never returns something already selected", () => {
    const edges = [edge("direction", "product")];
    const found = collectInheritedContext(edges, ["product", "direction"]);
    expect(found).toEqual([]);
  });

  it("survives a cycle", () => {
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a")];
    const found = collectInheritedContext(edges, ["a"]);
    expect(found.map((item) => item.id).sort()).toEqual(["b", "c"]);
  });

  it("treats an excluded object as a closed branch", () => {
    // brand → muted → product. Muting the middle stops the brand flowing through.
    const edges = [edge("brand", "muted"), edge("muted", "product")];
    const found = collectInheritedContext(edges, ["product"], { isExcluded: (id) => id === "muted" });
    expect(found).toEqual([]);
  });

  it("still reaches a node by an unmuted path", () => {
    const edges = [edge("brand", "muted"), edge("muted", "product"), edge("brand", "product")];
    const found = collectInheritedContext(edges, ["product"], { isExcluded: (id) => id === "muted" });
    expect(found.map((item) => item.id)).toEqual(["brand"]);
  });

  it("caps how much one busy corner can pull in", () => {
    const edges = Array.from({ length: 40 }, (_, index) => edge(`source-${index}`, "product"));
    expect(collectInheritedContext(edges, ["product"])).toHaveLength(MAX_INHERITED_NODES);
  });

  it("ignores self-links and malformed edges", () => {
    const edges = [edge("product", "product"), { source: "", target: "product" } as never];
    expect(collectInheritedContext(edges, ["product"])).toEqual([]);
  });
});

describe("arrow kinds", () => {
  it("does not treat a sequence arrow as direction", () => {
    // Slide 1 → slide 2 of a carousel. The first slide is not a brief for the
    // second, and inheriting it would make every slide a near-copy.
    const edges = [{ source: "slide1", target: "slide2", kind: "sequence" as const }];
    expect(collectInheritedContext(edges, ["slide2"])).toEqual([]);
  });

  it("still follows an arrow with no kind recorded", () => {
    // Every edge drawn before kinds existed. They must keep meaning "informs".
    expect(collectInheritedContext([edge("direction", "product")], ["product"])).toHaveLength(1);
  });

  it("keeps direction flowing alongside a sequence arrow", () => {
    const edges = [
      { source: "direction", target: "slide2" },
      { source: "slide1", target: "slide2", kind: "sequence" as const },
    ];
    expect(collectInheritedContext(edges, ["slide2"]).map((item) => item.id)).toEqual(["direction"]);
  });

  it("does not route direction through a sequence link", () => {
    // brand → slide1 →(then) slide2. The brand governs slide 1 only; it must not
    // arrive at slide 2 by riding the running order.
    const edges = [
      { source: "brand", target: "slide1" },
      { source: "slide1", target: "slide2", kind: "sequence" as const },
    ];
    expect(collectInheritedContext(edges, ["slide2"])).toEqual([]);
  });
});

describe("sequencePath", () => {
  const then = (source: string, target: string) => ({ source, target, kind: "sequence" as const });

  it("reads a running order out of a chain", () => {
    const edges = [then("b", "c"), then("a", "b")];
    expect(sequencePath(edges, ["c", "a", "b"])).toEqual(["a", "b", "c"]);
  });

  it("refuses a chain that does not cover everything selected", () => {
    // The stray card has no place in the order, so there is no order to read.
    expect(sequencePath([then("a", "b")], ["a", "b", "stray"])).toBeNull();
  });

  it("refuses a fork rather than picking a branch", () => {
    expect(sequencePath([then("a", "b"), then("a", "c")], ["a", "b", "c"])).toBeNull();
  });

  it("refuses a loop", () => {
    expect(sequencePath([then("a", "b"), then("b", "a")], ["a", "b"])).toBeNull();
  });

  it("ignores association arrows when reading the order", () => {
    expect(sequencePath([edge("a", "b")], ["a", "b"])).toBeNull();
  });

  it("has nothing to say about a single object", () => {
    expect(sequencePath([then("a", "b")], ["a"])).toBeNull();
  });
});

describe("sequencePosition", () => {
  const then = (source: string, target: string) => ({ source, target, kind: "sequence" as const });
  const chain = [then("a", "b"), then("b", "c"), then("c", "d")];

  it("counts a step from the head of its chain", () => {
    expect(sequencePosition(chain, "c")).toEqual({ step: 3, total: 4, previousId: "b" });
  });

  it("reports the first step with nothing before it", () => {
    expect(sequencePosition(chain, "a")).toEqual({ step: 1, total: 4, previousId: undefined });
  });

  it("says nothing about an object outside any chain", () => {
    expect(sequencePosition(chain, "loose")).toBeNull();
  });

  it("says nothing when the chain forks", () => {
    expect(sequencePosition([then("a", "b"), then("a", "c")], "b")).toBeNull();
  });

  it("survives a loop instead of spinning", () => {
    expect(sequencePosition([then("a", "b"), then("b", "a")], "a")).toBeNull();
  });
});
