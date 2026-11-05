// Database rules reject the invalid rows they exist for, with the rule's own name.
// The README lists which named rules have a test here and which do not yet.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { attempt, connect, optionId, variableId } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await connect();
  await c.query("begin");
});
afterAll(async () => {
  await c.query("rollback");
  await c.end();
});

async function rejects(sql: string, params: unknown[], constraint: string) {
  const err = await attempt(c, sql, params);
  expect(err, `expected ${constraint} to reject the row`).not.toBeNull();
  expect(err!.constraint).toBe(constraint);
}

const insertOption = "insert into options (variable_id, key, label, sentence_fragment, sort_order) values ($1, $2, $3, $4, $5)";

describe("constraints reject invalid rows", () => {
  it("empty sentence fragment → options_fragment_not_empty", async () => {
    await rejects(insertOption, [await variableId(c, "footwear"), "clogs", "Clogs", "   ", 9], "options_fragment_not_empty");
  });

  it("duplicate option key within a variable → options_key_unique_per_variable", async () => {
    await rejects(insertOption, [await variableId(c, "footwear"), "sandals", "Sandals again", "wearing sandals", 9], "options_key_unique_per_variable");
  });

  it("the same option key in a different variable is fine", async () => {
    expect(await attempt(c, insertOption, [await variableId(c, "carry"), "sandals", "Spare sandals", "bringing spare sandals", 9])).toBeNull();
  });

  it("negative option sort order → options_sort_order_min", async () => {
    await rejects(insertOption, [await variableId(c, "footwear"), "clogs", "Clogs", "wearing clogs", -1], "options_sort_order_min");
  });

  it("negative variable sort order → variables_sort_order_min", async () => {
    await rejects("insert into variables (key, label, sort_order) values ('mood', 'Mood?', -1)", [], "variables_sort_order_min");
  });

  it("negative sentence position → sentence_parts_position_min", async () => {
    const v = (await c.query<{ id: string }>("insert into variables (key, label, sort_order) values ('mood', 'Mood?', 50) returning id")).rows[0].id;
    await rejects("insert into sentence_parts (variable_id, position, role) values ($1, -1, 'item')", [v], "sentence_parts_position_min");
    await c.query("delete from variables where id = $1", [v]);
  });

  it("option for a variable that doesn't exist → options_variable_fk", async () => {
    await rejects(insertOption, [999999, "clogs", "Clogs", "wearing clogs", 0], "options_variable_fk");
  });

  it("condition pointing at its own variable → option_conditions_not_self_variable", async () => {
    await rejects(
      "insert into option_conditions (option_id, required_option_id) values ($1, $2)",
      [await optionId(c, "footwear.boots"), await optionId(c, "footwear.sandals")],
      "option_conditions_not_self_variable",
    );
  });

  it("condition pointing at a LATER question → option_conditions_required_earlier", async () => {
    // weather is question 1; it can't depend on footwear (question 3)
    await rejects(
      "insert into option_conditions (option_id, required_option_id) values ($1, $2)",
      [await optionId(c, "weather.sunny"), await optionId(c, "footwear.sandals")],
      "option_conditions_required_earlier",
    );
  });

  it("re-ordering questions so a condition points forward → option_conditions_required_earlier", async () => {
    await rejects("update variables set sort_order = 99 where key = 'weather'", [], "option_conditions_required_earlier");
  });

  it("condition pointing at an option that doesn't exist → option_conditions_required_fk", async () => {
    await rejects(
      "insert into option_conditions (option_id, required_option_id) values ($1, 999999)",
      [await optionId(c, "carry.umbrella")],
      "option_conditions_required_fk",
    );
  });

  it("condition on an option that doesn't exist, or moving an option that has conditions → option_conditions_option_fk", async () => {
    await rejects(
      "insert into option_conditions (option_id, required_option_id) values (999999, $1)",
      [await optionId(c, "weather.sunny")],
      "option_conditions_option_fk",
    );
    await rejects(
      "update options set variable_id = $1 where id = $2",
      [await variableId(c, "carry"), await optionId(c, "footwear.sandals")],
      "option_conditions_option_fk",
    );
  });

  it("tampered variable id on a condition is corrected by the trigger, so the pair always matches", async () => {
    const sandals = await optionId(c, "footwear.sandals");
    await c.query("update option_conditions set option_variable_id = $1 where option_id = $2", [await variableId(c, "carry"), sandals]);
    const r = await c.query("select distinct option_variable_id from option_conditions where option_id = $1", [sandals]);
    expect(r.rows).toEqual([{ option_variable_id: await variableId(c, "footwear") }]);
  });

  it("duplicate condition → option_conditions_unique", async () => {
    await rejects(
      "insert into option_conditions (option_id, required_option_id) values ($1, $2)",
      [await optionId(c, "footwear.sandals"), await optionId(c, "weather.sunny")],
      "option_conditions_unique",
    );
  });

  it("second settings row → sentence_settings_single_row", async () => {
    await rejects("insert into sentence_settings values (false, ', ', ', ', ' and ', '.')", [], "sentence_settings_single_row");
  });

  it("unknown sentence role → sentence_parts_role_valid", async () => {
    await rejects("update sentence_parts set role = 'footer' where position = 1", [], "sentence_parts_role_valid");
  });
});
