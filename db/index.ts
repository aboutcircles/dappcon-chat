import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Lazily initialise a Drizzle client bound to the Neon HTTP driver. Using HTTP
 * means each query is a fresh fetch — no connection pool to manage in
 * serverless. DATABASE_URL is auto-provisioned by the Neon Marketplace
 * integration.
 */
export function db() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Install the Neon integration via `vercel integration add neon` or set it manually in env.",
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}

export { schema };
