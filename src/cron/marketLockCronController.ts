import { pool } from "../db";

function getARGDate(d = new Date()) {
    return new Date(
        d.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
    );
}

function pad(n: number) {
    return String(n).padStart(2, "0");
}

function toYYYYMMDD(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const runMarketLockCron = async () => {
    try {
        const todayARG = toYYYYMMDD(getARGDate());

        const games = await pool.query(
            `SELECT * FROM hoopstats.nba_games_daily
             WHERE date_arg = $1
             ORDER BY start_time ASC`,
            [todayARG]
        );

        const rows = games.rows;

        const filtered = rows.filter(g => {
            const start = getARGDate(new Date(g.start_time));
            return start.getHours() >= 7;
        });

        let lockStart: Date;
        let noGamesToday = false;

        if (filtered.length === 0) {

            // Día sin partidos
            noGamesToday = true;

            lockStart = getARGDate();
            lockStart.setHours(7, 0, 0, 0);

        } else {
            const firstGame = filtered[0];
            const firstStart = getARGDate(new Date(firstGame.start_time));

            lockStart = new Date(firstStart.getTime() - 30 * 60 * 1000);
        }

        const lockEnd = new Date(lockStart);
        lockEnd.setDate(lockStart.getDate() + 1);
        lockEnd.setHours(7, 0, 0, 0);

        await pool.query(
            `INSERT INTO hoopstats.market_lock (lock_start, lock_end, no_games_today)
             VALUES ($1, $2, $3)`,
            [lockStart, lockEnd, noGamesToday]
        );

    } catch (err) {
        console.error("Error en MarketLockCron:", err);
    }
};
