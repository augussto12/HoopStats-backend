import { runMarketLockCron } from "../cron/marketLockCronController";
import { pool } from "../db";


export const getMarketLock = async (req: any, res: any) => {
    try {
        const r = await pool.query(
            `SELECT lock_start, lock_end
             FROM hoopstats.market_lock
             ORDER BY id DESC
             LIMIT 1`
        );

        if (r.rows.length === 0) {
            return res.json({
                isLocked: false,
                lockStart: null,
                lockEnd: null
            });
        }

        const { lock_start, lock_end } = r.rows[0];

        const now = new Date(
            new Date().toLocaleString("en-US", {
                timeZone: "America/Argentina/Buenos_Aires"
            })
        );

        const isLocked = now >= lock_start && now <= lock_end;

        return res.json({
            isLocked,
            lockStart: lock_start,
            lockEnd: lock_end
        });

    } catch (error) {
        console.error("Error al obtener market lock:", error);
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