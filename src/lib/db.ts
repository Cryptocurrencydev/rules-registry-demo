import "server-only";
import { Pool } from "pg";

const g = globalThis as unknown as { __rrPool?: Pool };

export function pool(): Pool {
  if (!g.__rrPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");
    const local = /localhost|127\.0\.0\.1|\/tmp/.test(url);
    g.__rrPool = new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } });
  }
  return g.__rrPool;
}
