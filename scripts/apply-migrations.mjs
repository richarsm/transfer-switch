import fs from "node:fs";
import path from "node:path";
import pg from "pg";

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
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

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
