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
        console.log("🏀 MarketLockCron para día ARG:", todayARG);

        const games = await pool.query(
            `SELECT * FROM hoopstats.nba_games_daily
             WHERE date_arg = $1
             ORDER BY start_time ASC`,
            [todayARG]
        );

        const rows = games.rows;
        console.log("🎮 Partidos cargados en nba_games_daily:", rows.length);

        // ✅ SOLO partidos que empiecen a partir de las 07:00 ARG
        const filtered = rows.filter(g => {
            const start = getARGDate(new Date(g.start_time));
            return start.getHours() >= 7;
        });

        console.log("🎯 Partidos después de las 07:00 ARG:", filtered.length);

        let lockStart: Date;
        let noGamesToday = false;

        if (filtered.length === 0) {
            // 🔹 No hay partidos “reales” hoy, pero IGUAL guardamos registro
            noGamesToday = true;

            lockStart = getARGDate();
            lockStart.setHours(7, 0, 0, 0);

            console.log("📭 No hay partidos después de las 07:00, se marca no_games_today = true");
        } else {
            // 🔓 Mercado abierto hasta la hora del primer partido (>= 07:00)
            const firstGame = filtered[0];
            const firstStart = getARGDate(new Date(firstGame.start_time));

            lockStart = firstStart;

            console.log(
                "⏰ Primer partido del día (>=07):",
                firstGame.game_id,
                "start_time ARG:",
                firstStart.toISOString()
            );
        }

        // 🔐 lockEnd: día siguiente a las 07:00 ARG
        const lockEnd = new Date(lockStart);
        lockEnd.setDate(lockStart.getDate() + 1);
        lockEnd.setHours(7, 0, 0, 0);

        console.log("🔒 Guardando market_lock:", {
            lockStart: lockStart.toISOString(),
            lockEnd: lockEnd.toISOString(),
            noGamesToday,
        });

        await pool.query(
            `INSERT INTO hoopstats.market_lock (lock_start, lock_end, no_games_today)
             VALUES ($1, $2, $3)`,
            [lockStart, lockEnd, noGamesToday]
        );

    } catch (err) {
        console.error("Error en MarketLockCron:", err);
    }
};
