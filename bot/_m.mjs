import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
dotenv.config({ path: '.env' });
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: 'require' });
await sql.unsafe(readFileSync('../db/010_slot_alternativen.sql', 'utf8'));
const r = await sql`select table_name, column_name, data_type from information_schema.columns
  where column_name in ('alt_weapon_ids','assigned_weapon_id') order by table_name, column_name`;
for (const x of r) console.log(`  ${x.table_name}.${x.column_name} (${x.data_type})`);
await sql.end();
