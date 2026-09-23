import { describe, expect, it } from "vitest";
import { ASSET_CARD_CHROME_HEIGHT, assetCardSize } from "./asset-layout";

describe("assetCardSize", () => {
  it("preserves a landscape asset's proportions", () => {
    expect(assetCardSize(3 / 2, 480)).toEqual({ width: 480, height: 320 + ASSET_CARD_CHROME_HEIGHT });
  });

  it("narrows a portrait card around the asset", () => {
    expect(assetCardSize(2 / 3, 480)).toEqual({ width: 320, height: 480 + ASSET_CARD_CHROME_HEIGHT });
  });

  it("keeps unusually narrow assets usable", () => {
    expect(assetCardSize(.25, 360)).toEqual({ width: 220, height: 880 + ASSET_CARD_CHROME_HEIGHT });
  });
});
