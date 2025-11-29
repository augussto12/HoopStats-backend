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

        // ============================================
        // 1) Traemos los partidos guardados del día
        // ============================================
        const games = await pool.query(
            `SELECT * FROM hoopstats.nba_games_daily
             WHERE date_arg = $1
             ORDER BY start_time ASC`,
            [todayARG]
        );

        const rows = games.rows;

        let lockStart: Date;

        // ============================================
        // 2) Caso: NO hay partidos hoy
        // ============================================
        if (rows.length === 0) {

            lockStart = getARGDate();
            lockStart.setHours(7, 0, 0, 0);

        } else {
            // ============================================
            // 3) Tomar el PRIMER partido del día
            // ============================================
            const firstGame = rows[0];
            const firstStart = new Date(firstGame.start_time);
            // Lock 30 minutos antes
            lockStart = new Date(firstStart.getTime() - 30 * 60 * 1000);
        }

        // ============================================
        // 4) Lock end → mañana 07:00 AM
        // ============================================
        const lockEnd = new Date(lockStart);
        lockEnd.setDate(lockStart.getDate() + 1);
        lockEnd.setHours(7, 0, 0, 0);

        // ============================================
        // 5) Guardar en DB
        // ============================================
        await pool.query(
            `INSERT INTO hoopstats.market_lock (lock_start, lock_end)
             VALUES ($1, $2)`,
            [lockStart, lockEnd]
        );


    } catch (err) {
        console.error("Error en MarketLockCron:", err);
    }
};
