import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnv(file) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv(".env");
loadEnv(".env.local");

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("Falta SUPABASE_DB_PASSWORD");
  process.exit(1);
}

const client = new pg.Client({
  host: "db.obyvfrrwmsqhlgmnoqfr.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password,
  ssl: { rejectUnauthorized: false },
});

const dir = path.resolve("supabase/migrations");
const only = process.argv[2];
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql") && (!only || f === only || f.startsWith(only)))
  .sort();
if (files.length === 0) {
  console.error(only ? `No hay migración que coincida con ${only}` : "No hay migraciones");
  process.exit(1);
}

await client.connect();
try {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`Aplicando ${file}... `);
    await client.query(sql);
    console.log("ok");
  }
} finally {
  await client.end();
}
