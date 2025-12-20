import { Pool, QueryResult, QueryConfig, QueryArrayResult } from "pg";
import dotenv from "dotenv";

dotenv.config();

/* ============================
      VALIDACIÓN ENV
============================ */
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR FATAL: Falta la variable DATABASE_URL");
  process.exit(1);
}

const TARGET_SCHEMA = process.env.DB_SCHEMA || "hoopstats";

/* ============================
      POOL
============================ */
const originalPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  max: 15,
  keepAlive: true
});

/**
 * HELPER DE REEMPLAZO
 * Si TARGET_SCHEMA es 'hoopstats_test', cambia todas las menciones 
 * de 'hoopstats.' por 'hoopstats_test.' en el texto de la query.
 */
const patchQueryText = (text: string | undefined): string | undefined => {
  if (!text || TARGET_SCHEMA === "hoopstats") return text;
  // Reemplazo global de "hoopstats." por el esquema de test
  return text.replace(/hoopstats\./g, `${TARGET_SCHEMA}.`);
};

/* ============================
      INTERCEPTOR DE QUERIES
============================ */
// Creamos un proxy para que no tengas que cambiar nada en el resto de tu app
export const pool = {
  ...originalPool,
  query: async (text: string | QueryConfig, params?: any[]): Promise<QueryResult<any>> => {
    if (typeof text === "string") {
      return originalPool.query(patchQueryText(text)!, params);
    } else {
      text.text = patchQueryText(text.text)!;
      return originalPool.query(text, params);
    }
  },
  // Mantenemos acceso al cliente para transacciones (BEGIN/COMMIT)
  connect: async () => {
    const client = await originalPool.connect();
    const originalQuery = client.query.bind(client);

    // Patch al cliente individual para que las transacciones también se traduzcan
    client.query = (text: any, params?: any): any => {
      if (typeof text === "string") {
        return originalQuery(patchQueryText(text)!, params);
      } else if (text && typeof text === "object") {
        text.text = patchQueryText(text.text)!;
        return originalQuery(text, params);
      }
      return originalQuery(text, params);
    };
    return client;
  },
  on: originalPool.on.bind(originalPool),
  end: originalPool.end.bind(originalPool),
};

console.log(`🚀 Modo DB: ${TARGET_SCHEMA === "hoopstats" ? "PRODUCCIÓN" : "TEST (" + TARGET_SCHEMA + ")"}`);

/* ============================
      HANDLERS DE SEGURIDAD
============================ */
originalPool.on("error", (err) => {
  console.error("🔥 Pool error inesperado:", err);
});

process.on("SIGTERM", async () => {
  console.log("🔌 Cerrando conexiones DB...");
  await originalPool.end();
  process.exit(0);
});