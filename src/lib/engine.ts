import "server-only";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { composeSentence, type SentencePart, type SentenceSettings } from "./compose";

// Thin adapter over the SQL engine (db/migrations/002_engine.sql). No rule logic here:
// which options exist, which are allowed and how they compose all come from the database.

export type Selections = Record<string, string>;
export type EngineOption = { key: string; label: string; selected: boolean };
export type EngineVariable = { key: string; label: string; options: EngineOption[] };
export type EngineState = { variables: EngineVariable[]; selections: Selections; sentence: string };

export class EngineError extends Error {
  constructor(message: string, public detail?: string) {
    super(message);
  }
}

type Queryable = Pick<PoolClient, "query">;

// Postgres raises 22023 (invalid_parameter_value) for refused selections.
function asEngineError(e: unknown): never {
  const pg = e as { code?: string; message?: string; detail?: string };
  if (pg.code === "22023") throw new EngineError(pg.message ?? "invalid selection", pg.detail);
  throw e;
}

async function idsFor(db: Queryable, selections: unknown): Promise<string[]> {
  try {
    const r = await db.query<{ ids: string[] }>("select selection_ids($1::jsonb) as ids", [JSON.stringify(selections ?? {})]);
    return r.rows[0].ids;
  } catch (e) {
    asEngineError(e);
  }
}

async function stateFor(db: Queryable, ids: string[]): Promise<EngineState> {
  // sequential on purpose: inside submit() these share one transaction client
  const vars = await db.query<{ key: string; label: string }>("select key, label from variables order by sort_order");
  const rows = await db.query<{ variable_key: string; option_key: string; option_label: string; sentence_fragment: string; selected: boolean }>(
    "select variable_key, option_key, option_label, sentence_fragment, selected from allowed_options($1::bigint[])",
    [ids],
  );
  const parts = await db.query<{ variable_key: string; position: number; role: SentencePart["role"] }>(
    "select v.key as variable_key, p.position, p.role from sentence_parts p join variables v on v.id = p.variable_id",
  );
  const settings = await db.query<{ connector: string; list_separator: string; last_separator: string; terminator: string }>(
    "select connector, list_separator, last_separator, terminator from sentence_settings",
  );

  const selections: Selections = {};
  const fragments: Record<string, string> = {};
  const byVar = new Map<string, EngineOption[]>(vars.rows.map((v) => [v.key, []]));
  for (const r of rows.rows) {
    byVar.get(r.variable_key)?.push({ key: r.option_key, label: r.option_label, selected: r.selected });
    if (r.selected) {
      selections[r.variable_key] = r.option_key;
      fragments[r.variable_key] = r.sentence_fragment;
    }
  }
  const s = settings.rows[0];
  const sentenceSettings: SentenceSettings = {
    connector: s.connector,
    listSeparator: s.list_separator,
    lastSeparator: s.last_separator,
    terminator: s.terminator,
  };
  const sentenceParts = parts.rows.map((p) => ({ variableKey: p.variable_key, position: p.position, role: p.role }));

  return {
    variables: vars.rows.map((v) => ({ key: v.key, label: v.label, options: byVar.get(v.key) ?? [] })),
    selections,
    sentence: composeSentence(sentenceParts, sentenceSettings, fragments),
  };
}

/** What the UI should show for the current answers. Stale later answers are dropped by the engine. */
export async function getState(selections: unknown = {}): Promise<EngineState> {
  const db = pool();
  return stateFor(db, await idsFor(db, selections));
}

/** Validate and save. Anything the engine would not have offered is refused and nothing is written. */
export async function submit(selections: unknown): Promise<{ id: string; sentence: string }> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const ids = await idsFor(client, selections);
    try {
      await client.query("select validate_selections($1::bigint[])", [ids]);
    } catch (e) {
      asEngineError(e);
    }
    const state = await stateFor(client, ids);
    if (!state.sentence) throw new EngineError("answer the first question before saving");
    const r = await client.query<{ id: string }>(
      "insert into submissions (option_ids, sentence) values ($1::bigint[], $2) returning id",
      [ids, state.sentence],
    );
    await client.query("commit");
    return { id: r.rows[0].id, sentence: state.sentence };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function recentSubmissions(limit = 5): Promise<{ id: string; sentence: string; createdAt: string }[]> {
  const r = await pool().query<{ id: string; sentence: string; created_at: Date }>(
    "select id, sentence, created_at from submissions order by id desc limit $1",
    [limit],
  );
  return r.rows.map((x) => ({ id: x.id, sentence: x.sentence, createdAt: x.created_at.toISOString() }));
}

/** Human-readable list of every condition, straight from option_conditions. */
export async function listRules(): Promise<{ option: string; variable: string; requires: string }[]> {
  const r = await pool().query<{ option: string; variable: string; requires: string }>(`
    select o.label as option, ov.key as variable,
           rv.key || ' is ' || string_agg(ro.label, ' or ' order by ro.sort_order) as requires
      from option_conditions c
      join options o on o.id = c.option_id
      join variables ov on ov.id = c.option_variable_id
      join options ro on ro.id = c.required_option_id
      join variables rv on rv.id = c.required_variable_id
     group by ov.sort_order, o.sort_order, o.label, ov.key, rv.sort_order, rv.key
     order by ov.sort_order, o.sort_order, rv.sort_order`);
  return r.rows;
}
