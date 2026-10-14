import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const pool = mysql.createPool({
  host: process.env.ASTRACLONE_DB_HOST!,
  port: Number(process.env.ASTRACLONE_DB_PORT ?? 3306),
  user: process.env.ASTRACLONE_DB_USER!,
  password: process.env.ASTRACLONE_DB_PASSWORD!,
  database: process.env.ASTRACLONE_DB_NAME!,
  waitForConnections: true,
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: "default" });
export type DB = typeof db;
