import { pool } from "../db";
import axios from "axios";

const API_URL = process.env.NBA_API_BASE_URL!;
const API_KEY = process.env.NBA_API_KEY!;
const SEASON = process.env.FANTASY_SEASON || "2025";

const headers = { "x-apisports-key": API_KEY };

// --------------------------
// API Helper
// --------------------------
async function apiGet(path: string, params: any = {}) {
    if (!API_URL || !API_KEY) {
        throw new Error("NBA_API_BASE_URL o NBA_API_KEY no configurados");
    }

    const url = `${API_URL}${path}`;
    const res = await axios.get(url, { headers, params });
    return res.data.response ?? [];
}

// --------------------------
// Helpers fecha ARG
// --------------------------
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

function addDaysStr(dateISO: string, delta: number): string {
    const [year, month, day] = dateISO.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + delta);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
        d.getUTCDate()
    )}`;
}

function convertUTCtoARG(utc: string) {
    const utcDate = new Date(utc);
    return new Date(
        utcDate.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
    );
}

// --------------------------
// Obtiene stats por partido
// --------------------------
async function getStatsForGame(gameId: number): Promise<any[]> {
    try {
        const stats = await apiGet("/players/statistics", { game: gameId });
        return stats || [];
    } catch (err) {
        console.error("Error fetching stats for game", gameId, err);
        return [];
    }
}

// ======================================================
//               CRON PRINCIPAL
// ======================================================
// ======================================================
//             CRON PRINCIPAL (VERSIÓN OPTIMIZADA)
// ======================================================
export const runBestPlayersCron = async () => {
    console.log("BestPlayersCron START");
    const client = await pool.connect();

    try {
        const nowARG = getARGDate();
        const todayStr = toYYYYMMDD(nowARG);
        const yesterdayStr = addDaysStr(todayStr, -1);

        console.log(`Cron running at: ${nowARG.toISOString()} - Target Day: ${yesterdayStr}`);

        // 1) Asegurar que el día existe
        const dayRes = await client.query(
            `INSERT INTO days(date) VALUES ($1)
             ON CONFLICT (date) DO UPDATE SET date = EXCLUDED.date
             RETURNING id`,
            [yesterdayStr]
        );
        const dayId = dayRes.rows[0].id;

        // 2) Pedir juegos de ayer y hoy
        const [gY, gT] = await Promise.all([
            apiGet("/games", { date: yesterdayStr, season: SEASON }),
            apiGet("/games", { date: todayStr, season: SEASON }),
        ]);

        let gamesAll = Array.from(new Map([...gY, ...gT].map(g => [g.id, g])).values());

        // 3) Filtro de jornada ARG (07:00 AM a 07:00 AM)
        const gamesYesterdayARG = gamesAll.filter((g: any) => {
            const start = convertUTCtoARG(g.date?.start);
            const limitStart = new Date(nowARG);
            limitStart.setDate(limitStart.getDate() - 1);
            limitStart.setHours(7, 0, 0, 0);

            const limitEnd = new Date(nowARG);
            limitEnd.setHours(7, 0, 0, 0);

            return start > limitStart && start <= limitEnd;
        });

        const finishedGames = gamesYesterdayARG.filter((g: any) =>
            ["Finished", "Final", "FT"].includes(g?.status?.long)
        );

        if (!finishedGames.length) {
            console.log("BestPlayersCron END (no finished games)");
            return;
        }

        // 4) Obtener estadísticas
        const statsArrays = await Promise.all(
            finishedGames.map((g: any) => getStatsForGame(g.id))
        );
        const allStats = statsArrays.flat();

        if (!allStats.length) {
            console.log("BestPlayersCron END (no stats)");
            return;
        }

        // 5) Calcular líderes por categoría
        const categories = [
            { key: "points", name: "Puntos" },
            { key: "totReb", name: "Rebotes" },
            { key: "assists", name: "Asistencias" },
            { key: "steals", name: "Robos" },
            { key: "blocks", name: "Tapones" },
            { key: "tpm", name: "Triples" },
        ];

        const leaders: any[] = [];
        for (const c of categories) {
            let best: any = null;
            for (const s of allStats) {
                const statVal = Number(s?.[c.key]) || 0;
                if (!best || statVal > best.value) {
                    best = {
                        category: c.name,
                        player: `${s.player.firstname} ${s.player.lastname}`,
                        player_id: s.player.id,
                        value: statVal,
                    };
                }
            }
            if (best) leaders.push(best);
        }

        // 6) Guardar en DB con BATCH INSERT (Una sola query para todo)
        await client.query("BEGIN");

        // Limpiamos líderes viejos de ese día
        await client.query(
            `DELETE FROM best_players_by_day WHERE day_id = $1`,
            [dayId]
        );

        if (leaders.length > 0) {
            // Construimos los placeholders ($1, $2, $3...) dinámicamente
            // Cada líder tiene 5 campos: day_id, category, player_name, player_id, value
            const valuesPlaceholder = leaders.map((_, i) =>
                `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`
            ).join(',');

            const flatValues = leaders.flatMap(l => [
                l.category,
                l.player,
                l.player_id,
                l.value
            ]);

            const insertQuery = `
                INSERT INTO best_players_by_day 
                (day_id, category, player_name, player_id, value)
                VALUES ${valuesPlaceholder}
            `;

            await client.query(insertQuery, [dayId, ...flatValues]);
        }

        await client.query("COMMIT");
        console.log("BestPlayersCron END OK", { leaders: leaders.length });

    } catch (err) {
        if (client) await client.query("ROLLBACK");
        console.error("Error en BestPlayersCron:", err);
        throw err;
    } finally {
        client.release();
    }
};
