// The sentence is composed deterministically from data: part order, roles, glue words and fragments.
import { afterAll, describe, expect, it } from "vitest";
import { composeSentence } from "@/lib/compose";
import { getState } from "@/lib/engine";
import { pool } from "@/lib/db";

afterAll(async () => {
  await pool().end();
});

describe("sentence composition from the database", () => {
  const cases: [Record<string, string>, string][] = [
    [{ weather: "rainy", footwear: "boots", carry: "umbrella" }, "It's rainy, so I'm wearing boots and bringing an umbrella."],
    [{ weather: "sunny", activity: "beach", footwear: "sandals", carry: "sun_hat" }, "It's sunny, so I'm heading to the beach, wearing sandals and bringing a sun hat."],
    [{ weather: "snowy", activity: "snowman" }, "It's snowing, so I'm building a snowman."],
    [{ weather: "windy" }, "It's windy."],
    [{ weather: "rainy", activity: "hiking", footwear: "hiking_boots", carry: "water" }, "It's rainy, so I'm going hiking, wearing hiking boots and bringing a water bottle."],
    [{}, ""],
  ];
  for (const [selections, expected] of cases) {
    it(`${JSON.stringify(selections)} → "${expected}"`, async () => {
      expect((await getState(selections)).sentence).toBe(expected);
    });
  }
});

describe("composeSentence (pure function)", () => {
  const settings = { connector: ", so I'm ", listSeparator: ", ", lastSeparator: " and ", terminator: "." };
  const parts = [
    { variableKey: "c", position: 2, role: "item" as const },
    { variableKey: "a", position: 0, role: "lead" as const },
    { variableKey: "b", position: 1, role: "item" as const },
  ];

  it("follows position order, not input order", () => {
    expect(composeSentence(parts, settings, { c: "z", b: "y", a: "x" })).toBe("X, so I'm y and z.");
  });

  it("is deterministic", () => {
    const f = { a: "x", b: "y", c: "z" };
    expect(new Set(Array.from({ length: 20 }, () => composeSentence(parts, settings, f))).size).toBe(1);
  });

  it("changing the data changes the sentence; the code stays the same", () => {
    const reordered = parts.map((p) => (p.variableKey === "b" ? { ...p, position: 3 } : p));
    expect(composeSentence(reordered, { ...settings, connector: ", therefore ", terminator: "!" }, { a: "x", b: "y", c: "z" })).toBe(
      "X, therefore z and y!",
    );
  });
});
