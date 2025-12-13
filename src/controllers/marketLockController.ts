import { runMarketLockCron } from "../cron/marketLockCronController";
import { pool } from "../db";


export const getMarketLock = async (req: any, res: any) => {
    try {
        const r = await pool.query(`
            SELECT lock_start, lock_end, no_games_today
            FROM hoopstats.market_lock
            ORDER BY lock_start DESC
            LIMIT 1
        `);

        // Si nunca se corrió el cron / no hay registro aún
        if (r.rows.length === 0) {
            return res.json({
                isLocked: false,
                lockStart: null,
                lockEnd: null,
                noGamesToday: true   // interpretamos como "no hay info / no hay lock"
            });
        }

        const { lock_start, lock_end, no_games_today } = r.rows[0];

        const nowARG = new Date(
            new Date().toLocaleString("en-US", {
                timeZone: "America/Argentina/Buenos_Aires"
            })
        );

        // CLAVE: si no_games_today = true → jamás se considera locked
        const isLocked =
            !no_games_today &&
            nowARG >= lock_start &&
            nowARG <= lock_end;

        return res.json({
            isLocked,
            lockStart: lock_start,
            lockEnd: lock_end,
            noGamesToday: no_games_today
        });

    } catch (e) {
        console.error("Error getMarketLock:", e);
        return res.status(500).json({ error: "Error al obtener market lock" });
    }
};




export const runMarketLockCronController = async (req: any, res: any) => {

    if (req.headers["x-cron-key"] !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const result = await runMarketLockCron();
        return res.json({
            message: "Market Lock Cron ejecutado correctamente",
            result
        });
    } catch (err) {
        console.error("Error ejecutando Market Lock Cron", err);
        return res.status(500).json({ error: "Error ejecutando cron" });
    }
};