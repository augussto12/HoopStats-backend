import { pool } from "../db";

export const isMarketLocked = async (): Promise<boolean> => {
    const nowARG = new Date(
        new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );

    const today = nowARG.toISOString().slice(0, 10); // YYYY-MM-DD

    // Buscar SOLO el lock del día actual
    const res = await pool.query(
        `SELECT lock_start, lock_end
         FROM hoopstats.market_lock
         WHERE lock_start::date = $1
         LIMIT 1`,
        [today]
    );

    // ❗ No hay lock hoy → día libre
    if (res.rows.length === 0) {
        return false;
    }

    const { lock_start, lock_end } = res.rows[0];

    // Chequear si AHORA está dentro del período bloqueado
    return nowARG >= lock_start && nowARG <= lock_end;
};
