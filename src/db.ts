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

// Obtenemos el esquema del ENV o usamos el default
const TARGET_SCHEMA = process.env.DB_SCHEMA || "hoopstats";

/* ============================
    POOL SEGURO
============================ */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Necesario para Railway
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  max: 20,
});

/* ============================
    CONFIGURACIÓN AUTOMÁTICA
============================ */
// Cada vez que el Pool crea una nueva conexión, ejecutamos esto automáticamente.
pool.on('connect', (client) => {
  // Solo permitimos caracteres alfanuméricos y underscores para el esquema
  const safeSchema = TARGET_SCHEMA.replace(/[^a-z0-9_]/gi, '');
  client.query(`SET search_path TO ${safeSchema}, public`)
    .catch(err => console.error('❌ Error seteando search_path', err));
});
/* ============================
    HANDLERS DE ERROR
============================ */
pool.on("error", (err) => {
  console.error("🔥 Error inesperado en el cliente de DB:", err);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});

console.log(`🚀 Base de datos conectada. Usando esquema: ${TARGET_SCHEMA}`);