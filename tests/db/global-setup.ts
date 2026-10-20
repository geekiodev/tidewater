import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

/**
 * Builds a fresh test database from scratch before the suite runs:
 * DROP + CREATE the database named in TEST_DATABASE_URL, load the Supabase
 * shim, then apply every migration in supabase/migrations in order.
 *
 * Unit tests don't need it; if only unit tests are selected and no
 * TEST_DATABASE_URL is set, setup is skipped. DB tests themselves fail loudly
 * without a database rather than silently skipping.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  const onlyUnit = process.argv.some((a) => a.includes("tests/unit"));
  if (!url) {
    if (onlyUnit) return;
    throw new Error(
      "TEST_DATABASE_URL is not set. The database tests need a real Postgres (see README: Running tests). " +
        "Run `npm run test:unit` to run only the unit tests.",
    );
  }

  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    // Safety: never drop a database that isn't clearly a throwaway test DB.
    throw new Error(`Refusing to reset "${dbName}": the test database name must end in _test.`);
  }

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const adminClient = new Client({ connectionString: admin.toString() });
  await adminClient.connect();
  await adminClient.query(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminClient.query(`drop database if exists ${dbName}`);
  await adminClient.query(`create database ${dbName}`);
  await adminClient.end();

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const root = process.cwd();
    await db.query(readFileSync(join(root, "tests/db/supabase-shim.sql"), "utf8"));
    const dir = join(root, "supabase/migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      try {
        await db.query(readFileSync(join(dir, f), "utf8"));
      } catch (err) {
        throw new Error(`Migration ${f} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await db.end();
  }
}
