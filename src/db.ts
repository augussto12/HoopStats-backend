import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

/* ============================
      VALIDACIÓN ENV
============================ */
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR FATAL: Falta la variable DATABASE_URL");
  process.exit(1);
}

/* ============================
      POOL
============================ */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Railway usa SSL obligatorio con certificado autofirmado
  ssl: { rejectUnauthorized: false },

  // Seguridad y performance
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  max: 15,
  keepAlive: true
});

/* ============================
      HANDLERS DE SEGURIDAD
============================ */
pool.on("error", (err) => {
  console.error("🔥 Pool error inesperado:", err);
});

process.on("SIGTERM", async () => {
  console.log("🔌 Cerrando conexiones DB...");
  await pool.end();
  process.exit(0);
});
