import type { PoolClient } from "pg";
import { pool } from "../db";

const ARG_TZ = "America/Argentina/Buenos_Aires";

// YYYY-MM-DD en Argentina sin corrimiento por UTC
const todayInArgentina = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: ARG_TZ }).format(new Date());

export const isMarketLocked = async (client?: PoolClient): Promise<boolean> => {
    const db = client ?? pool;

    // "ahora" en Argentina (como Date)
    const nowARG = new Date(
        new Date().toLocaleString("en-US", { timeZone: ARG_TZ })
    );

    const today = todayInArgentina();

    const res = await db.query(
        `SELECT lock_start, lock_end
     FROM hoopstats.market_lock
     WHERE lock_start::date = $1
     LIMIT 1`,
        [today]
    );

    if (res.rowCount === 0) return false;

    const lockStart = new Date(res.rows[0].lock_start);
    const lockEnd = new Date(res.rows[0].lock_end);

    return nowARG >= lockStart && nowARG <= lockEnd;
};
