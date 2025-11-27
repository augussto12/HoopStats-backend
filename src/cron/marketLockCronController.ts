import { pool } from "../db";
import axios from "axios";

const API_URL = process.env.NBA_API_BASE_URL!;
const API_KEY = process.env.NBA_API_KEY!;
const SEASON = process.env.FANTASY_SEASON || "2025";

const headers = { "x-apisports-key": API_KEY };

// ----------------------------
// Helpers idénticos al cron de puntos
// ----------------------------
function getArgentinaDate(offsetDays: number = 0) {
    const now = new Date(
        new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );
    now.setDate(now.getDate() + offsetDays);
    return now.toISOString().slice(0, 10);
}

async function apiGet(path: string, params: any = {}) {
    const url = `${API_URL}${path}`;
    const res = await axios.get(url, { headers, params });
    return res.data.response;
}

// ----------------------------
// Convertir "10:00 p. m." → Date ARG
// ----------------------------
function convertUtcToArgentina(utcString: string): Date {
    const utcDate = new Date(utcString);

    const argString = utcDate.toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
    });

    return new Date(argString);
}


// ----------------------------
// CRON DEL MARKET LOCK
// ----------------------------
export const runMarketLockCron = async () => {
    console.log("⏰ Iniciando Market Lock Cron...");

    try {
        const todayARG = getArgentinaDate(0);
        console.log("📅 Fecha ARG:", todayARG);

        // 1) Obtener partidos de hoy
        const games = await apiGet("/games", { date: todayARG, season: SEASON });

        console.log(`Partidos totales hoy: ${games.length}`);

        // 2) Filtrar Programados
        const scheduled = games.filter((g: any) => ["Scheduled", "Programado"].includes(g.status.long));

        console.log(`📌 Partidos programados: ${scheduled.length}`);

        let lockStart: Date;

        if (scheduled.length === 0) {
            // No hay partidos → Lock desde YA hasta mañana 7 AM
            console.log("⚠️ No hay partidos programados → se usa 07:00 AM como lock_start");

            lockStart = new Date(
                new Date().toLocaleString("en-US", {
                    timeZone: "America/Argentina/Buenos_Aires",
                })
            );
            lockStart.setHours(7, 0, 0, 0);

        } else {
            // Tomar primer partido del día por horario local
            const firstGame = scheduled
                .map((g: any) => ({
                    ...g,
                    start: convertUtcToArgentina(g.date.start)
                }))
                .sort((a: any, b: any) => a.start - b.start)[0];

            console.log("🎯 Primer partido:", firstGame.start);

            // Lock = 30 minutos antes
            lockStart = new Date(firstGame.start.getTime() - 30 * 60000);
            console.log("🔐 Lock Start calculado:", lockStart);
        }

        // 3) Lock END = mañana 07:00 AM
        const lockEnd = new Date(lockStart);
        lockEnd.setDate(lockStart.getDate() + 1);
        lockEnd.setHours(7, 0, 0, 0);

        console.log("🔚 Lock End:", lockEnd);

        // 4) Guardar en DB
        await pool.query(
            `INSERT INTO hoopstats.market_lock (lock_start, lock_end)
             VALUES ($1, $2)`,
            [lockStart, lockEnd]
        );

        console.log("✔️ Market Lock almacenado correctamente.");

        return { lockStart, lockEnd };
    } catch (err) {
        console.error("❌ Error en MarketLockCron:", err);
    }


};
