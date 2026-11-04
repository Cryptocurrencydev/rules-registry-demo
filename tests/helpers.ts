import { Client } from "pg";

export async function connect(): Promise<Client> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

/** Runs sql inside a savepoint that is always rolled back; returns the error Postgres raised (or null). */
export async function attempt(c: Client, sql: string, params: unknown[] = []): Promise<{ constraint?: string; code?: string; message: string } | null> {
  await c.query("savepoint t");
  try {
    await c.query(sql, params);
    return null;
  } catch (e) {
    return e as { constraint?: string; code?: string; message: string };
  } finally {
    await c.query("rollback to savepoint t");
  }
}

/** Option id by "variable.option" key. */
export async function optionId(c: Client, ref: string): Promise<string> {
  const [v, o] = ref.split(".");
  const r = await c.query<{ id: string }>(
    "select o.id from options o join variables v on v.id = o.variable_id where v.key = $1 and o.key = $2",
    [v, o],
  );
  if (!r.rows[0]) throw new Error(`no option ${ref}`);
  return r.rows[0].id;
}

export async function variableId(c: Client, key: string): Promise<string> {
  return (await c.query<{ id: string }>("select id from variables where key = $1", [key])).rows[0].id;
}
