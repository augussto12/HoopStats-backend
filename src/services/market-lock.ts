import { pool } from "../db";

export const isMarketLocked = async (): Promise<boolean> => {
    const res = await pool.query(
        `SELECT lock_start, lock_end
         FROM hoopstats.market_lock
         ORDER BY id DESC
         LIMIT 1`
    );

    if (res.rows.length === 0) return false;

    const { lock_start, lock_end } = res.rows[0];

    const now = new Date(
        new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );

    return now >= lock_start && now <= lock_end;
};
