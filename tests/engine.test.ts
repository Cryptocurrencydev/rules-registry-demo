// The engine only returns options whose conditions are met, the API refuses anything else,
// and a refused option never reaches a saved or composed sentence.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { getState } from "@/lib/engine";
import { pool } from "@/lib/db";
import { POST as submitRoute } from "@/app/api/submissions/route";
import { POST as optionsRoute } from "@/app/api/options/route";
import { connect } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
  await pool().end();
});

const offered = async (selections: Record<string, string>, variable: string) =>
  (await getState(selections)).variables.find((v) => v.key === variable)!.options.map((o) => o.key);

const post = (route: (r: Request) => Promise<Response>, selections: unknown) =>
  route(new Request("http://test/api", { method: "POST", body: JSON.stringify({ selections }) }));

const savedCount = async () => Number((await c.query("select count(*) from submissions")).rows[0].count);

describe("engine: unmet conditions are never returned", () => {
  it("nothing selected: options with conditions are hidden, unconditional ones shown", async () => {
    expect(await offered({}, "footwear")).toEqual(["trainers"]);
    expect(await offered({}, "carry")).toEqual([]);
  });

  it("rainy: sandals and sun hat are not offered; boots and umbrella are", async () => {
    expect(await offered({ weather: "rainy" }, "footwear")).toEqual(["trainers", "boots"]);
    expect(await offered({ weather: "rainy" }, "carry")).toEqual(["umbrella"]);
  });

  it("sunny: sandals offered, boots not", async () => {
    expect(await offered({ weather: "sunny" }, "footwear")).toEqual(["sandals", "trainers"]);
  });

  it("OR within a variable: scarf appears for snowy or windy, not rainy", async () => {
    expect(await offered({ weather: "snowy" }, "carry")).toContain("scarf");
    expect(await offered({ weather: "windy" }, "carry")).toContain("scarf");
    expect(await offered({ weather: "rainy" }, "carry")).not.toContain("scarf");
  });

  it("conditions on a non-first question: hiking boots need activity = hiking", async () => {
    expect(await offered({ weather: "rainy", activity: "commute" }, "footwear")).not.toContain("hiking_boots");
    expect(await offered({ weather: "rainy", activity: "hiking" }, "footwear")).toContain("hiking_boots");
  });

  it("changing an early answer drops later answers that no longer fit", async () => {
    const s = await getState({ weather: "rainy", footwear: "sandals", carry: "umbrella" });
    expect(s.selections).toEqual({ weather: "rainy", carry: "umbrella" });
    expect(s.sentence).not.toMatch(/sandals/);
  });
});

describe("api: a forced disallowed option is refused and never saved", () => {
  it("sandals with rainy weather → 422, nothing written", async () => {
    const before = await savedCount();
    const res = await post(submitRoute, { weather: "rainy", footwear: "sandals" });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('footwear: "sandals" is not allowed with the current answers');
    expect(body.detail).toBe("It requires weather = sunny.");
    expect(await savedCount()).toBe(before);
    expect((await c.query("select count(*) from submissions where sentence ilike '%sandals%'")).rows[0].count).toBe("0");
  });

  it("hiking boots without hiking → 422 naming the requirement", async () => {
    const res = await post(submitRoute, { weather: "rainy", activity: "commute", footwear: "hiking_boots" });
    expect(res.status).toBe(422);
    expect((await res.json()).detail).toBe("It requires activity = hiking.");
  });

  it("unknown option keys → 422", async () => {
    const res = await post(submitRoute, { weather: "foggy" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('unknown option "foggy" for "weather"');
  });

  it("non-object selections → 422", async () => {
    expect((await post(submitRoute, ["rainy"])).status).toBe(422);
    expect((await post(submitRoute, { weather: ["rainy", "sunny"] })).status).toBe(422);
  });

  it("no first answer → 422 (no empty sentence saved)", async () => {
    expect((await post(submitRoute, { footwear: "trainers" })).status).toBe(422);
  });

  it("the live-preview endpoint never returns or composes a disallowed option", async () => {
    const res = await post(optionsRoute, { weather: "rainy", footwear: "sandals" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body.variables)).not.toContain("sandals");
    expect(body.sentence).toBe("It's rainy.");
  });

  it("a valid selection is saved with the composed sentence", async () => {
    const res = await post(submitRoute, { weather: "rainy", footwear: "boots", carry: "umbrella" });
    expect(res.status).toBe(201);
    const { id, sentence } = await res.json();
    expect(sentence).toBe("It's rainy, so I'm wearing boots and bringing an umbrella.");
    const row = (await c.query("select sentence from submissions where id = $1", [id])).rows[0];
    expect(row.sentence).toBe(sentence);
  });
});
