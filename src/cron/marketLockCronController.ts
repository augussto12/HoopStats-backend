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

function formatARG(d: Date) {
    return d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

export const runMarketLockCron = async () => {
    console.log("MarketLockCron START");

    try {
        const todayARG = toYYYYMMDD(getARGDate());
        console.log("MarketLockCron para día ARG:", todayARG);

        const games = await pool.query(
            `SELECT * FROM hoopstats.nba_games_daily
       WHERE date_arg = $1
       ORDER BY start_time ASC`,
            [todayARG]
        );

        const rows = games.rows;
        console.log("Partidos cargados en nba_games_daily:", rows.length);

        // SOLO partidos que empiecen a partir de las 07:00 ARG (solo para elegir el primero)
        const filtered = rows.filter((g: any) => {
            const startARG = getARGDate(new Date(g.start_time));
            return startARG.getHours() >= 7;
        });

        console.log("Partidos después de las 07:00 ARG:", filtered.length);

        let lockStart: Date;
        let noGamesToday = false;

        if (filtered.length === 0) {
            noGamesToday = true;

            lockStart = getARGDate();
            lockStart.setHours(7, 0, 0, 0);

            console.log("No hay partidos después de las 07:00, no_games_today = true");
        } else {
            const firstGame = filtered[0];

            // TOMAR EL INSTANTE REAL GUARDADO (timestamptz) SIN RECONVERTIR
            lockStart = new Date(firstGame.start_time);

            console.log(
                "Primer partido del día (>=07):",
                firstGame.game_id,
                "start_time ARG:",
                formatARG(lockStart),
                "UTC:",
                lockStart.toISOString()
            );
        }

        // lockEnd: día siguiente a las 07:00 ARG
        const lockEnd = new Date(lockStart);
        lockEnd.setDate(lockStart.getDate() + 1);
        lockEnd.setHours(7, 0, 0, 0);

        console.log("Guardando market_lock:", {
            lockStart_ARG: formatARG(lockStart),
            lockEnd_ARG: formatARG(lockEnd),
            noGamesToday,
        });

        // Ahora lock_start es timestamptz: esto sigue OK
        await pool.query(
            `DELETE FROM hoopstats.market_lock
       WHERE (lock_start AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = $1::date`,
            [todayARG]
        );

        // INSERTAR COMO ISO (UTC) para timestamptz
        await pool.query(
            `INSERT INTO hoopstats.market_lock (lock_start, lock_end, no_games_today)
       VALUES ($1, $2, $3)`,
            [lockStart.toISOString(), lockEnd.toISOString(), noGamesToday]
        );

        console.log("MarketLockCron END OK");
    } catch (err) {
        console.error("Error en MarketLockCron:", err);
        throw err;
    }
};
