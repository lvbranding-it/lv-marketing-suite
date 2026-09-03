import type { HexColor, RgbColor } from "./types";

const HEX_COLOR_PATTERN = /^#?([\da-f]{3}|[\da-f]{6})$/i;
const CHANNEL_EPSILON = 1e-6;

export interface NormalizedLottieColor {
  rgb: RgbColor;
  hex: HexColor;
  alpha: number | null;
  sourceColor: number[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isUnitChannel(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -CHANNEL_EPSILON &&
    value <= 1 + CHANNEL_EPSILON
  );
}

export function rgbToHex(rgb: RgbColor): HexColor {
  const channel = (value: number) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();

  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/** Accepts three- or six-digit HEX, with or without `#`, and returns uppercase six-digit HEX. */
export function normalizeHexColor(value: string): HexColor | null {
  if (typeof value !== "string") return null;

  const match = value.trim().match(HEX_COLOR_PATTERN);
  if (!match) return null;

  const digits = match[1].length === 3
    ? [...match[1]].map((digit) => `${digit}${digit}`).join("")
    : match[1];

  return `#${digits.toUpperCase()}`;
}

export function hexToRgb(value: string): RgbColor | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

/**
 * Normalizes a static Lottie RGB/RGBA array to 8-bit RGB. Alpha remains untouched.
 * Returns null for animated, out-of-range, or malformed structures.
 */
export function normalizeLottieColor(value: unknown): NormalizedLottieColor | null {
  if (!Array.isArray(value) || (value.length !== 3 && value.length !== 4)) return null;
  if (!value.every(isUnitChannel)) return null;

  const rgb = {
    r: Math.round(clamp(value[0], 0, 1) * 255),
    g: Math.round(clamp(value[1], 0, 1) * 255),
    b: Math.round(clamp(value[2], 0, 1) * 255),
  };

  return {
    rgb,
    hex: rgbToHex(rgb),
    alpha: value.length === 4 ? value[3] : null,
    sourceColor: [...value],
  };
}

export function rgbToLottieChannels(rgb: RgbColor): [number, number, number] {
  return [rgb.r / 255, rgb.g / 255, rgb.b / 255];
}
