import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSavedSchemes,
  createScheme,
  getBuiltInSchemes,
  loadSchemes,
  saveSchemes,
  SCHEME_STORAGE_KEY,
  type SchemeStorage,
} from "./index";

class MemoryStorage implements SchemeStorage {
  readonly records = new Map<string, string>();
  getItem(key: string) { return this.records.get(key) ?? null; }
  setItem(key: string, value: string) { this.records.set(key, value); }
  removeItem(key: string) { this.records.delete(key); }
}

const DATE = new Date("2026-06-15T09:10:11.000Z");
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe("palette scheme localStorage", () => {
  it("returns the built-in scheme when no saved data exists", () => {
    expect(loadSchemes(storage)).toEqual(getBuiltInSchemes());
  });

  it("persists and reloads custom schemes in their original order", () => {
    const one = createScheme(getBuiltInSchemes(), { name: "One", colors: ["#111111", "#222222"] }, { now: DATE, idFactory: () => "one" });
    const two = createScheme(one.schemes, { name: "Two", colors: ["#333333"] }, { now: DATE, idFactory: () => "two" });

    expect(saveSchemes(two.schemes, storage)).toBe(true);
    const raw = JSON.parse(storage.getItem(SCHEME_STORAGE_KEY) as string);
    expect(raw.version).toBe(1);
    expect(raw.schemes.map(({ name }: { name: string }) => name)).toEqual(["One", "Two"]);
    expect(raw.schemes.some(({ isBuiltIn }: { isBuiltIn: boolean }) => isBuiltIn)).toBe(false);

    expect(loadSchemes(storage).map(({ name }) => name)).toEqual(["LV Branding", "One", "Two"]);
  });

  it("survives malformed JSON, unknown versions, and unavailable storage", () => {
    storage.setItem(SCHEME_STORAGE_KEY, "{not json");
    expect(loadSchemes(storage)).toEqual(getBuiltInSchemes());

    storage.setItem(SCHEME_STORAGE_KEY, JSON.stringify({ version: 999, schemes: [] }));
    expect(loadSchemes(storage)).toEqual(getBuiltInSchemes());

    const throwing: SchemeStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(loadSchemes(throwing)).toEqual(getBuiltInSchemes());
    expect(saveSchemes(getBuiltInSchemes(), throwing)).toBe(false);
    expect(clearSavedSchemes(throwing)).toBe(false);
  });

  it("salvages valid records and rejects bad schema, duplicate IDs, and built-in spoofing", () => {
    storage.setItem(SCHEME_STORAGE_KEY, JSON.stringify({
      version: 1,
      schemes: [
        {
          id: "scheme-valid",
          name: " <b>Valid</b> ",
          colors: ["fff", "#123abc"],
          createdAt: DATE.toISOString(),
          updatedAt: DATE.toISOString(),
          isBuiltIn: false,
        },
        {
          id: "scheme-valid",
          name: "Duplicate ID",
          colors: ["#000000"],
          createdAt: DATE.toISOString(),
          updatedAt: DATE.toISOString(),
          isBuiltIn: false,
        },
        {
          id: "builtin-lv-branding",
          name: "Spoof",
          colors: ["#000000"],
          createdAt: DATE.toISOString(),
          updatedAt: DATE.toISOString(),
          isBuiltIn: false,
        },
        {
          id: "scheme-malformed",
          name: "Bad color",
          colors: ["tomato"],
          createdAt: DATE.toISOString(),
          updatedAt: DATE.toISOString(),
          isBuiltIn: false,
        },
      ],
    }));

    const loaded = loadSchemes(storage);
    expect(loaded.map(({ id }) => id)).toEqual(["builtin-lv-branding", "scheme-valid"]);
    expect(loaded[1]).toMatchObject({ name: "Valid", colors: ["#FFFFFF", "#123ABC"] });
  });

  it("clears custom data without affecting availability of the built-in", () => {
    storage.setItem(SCHEME_STORAGE_KEY, "anything");
    expect(clearSavedSchemes(storage)).toBe(true);
    expect(storage.getItem(SCHEME_STORAGE_KEY)).toBeNull();
    expect(loadSchemes(storage)).toEqual(getBuiltInSchemes());
  });
});
