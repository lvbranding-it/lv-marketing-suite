export const ASSET_CARD_CHROME_HEIGHT = 132;

/**
 * Fits an artwork card to the asset instead of forcing every image through the
 * same box. The image's longest displayed edge stays close to the card's
 * existing width, while the compact title/prompt/context chrome is added below.
 */
export function assetCardSize(aspectRatio: number, currentWidth: number) {
  const safeRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const visualEdge = Math.min(480, Math.max(280, currentWidth));
  const width = safeRatio >= 1 ? visualEdge : Math.max(220, visualEdge * safeRatio);
  const imageHeight = width / safeRatio;

  return {
    width: Math.round(width),
    height: Math.round(imageHeight + ASSET_CARD_CHROME_HEIGHT),
  };
}
