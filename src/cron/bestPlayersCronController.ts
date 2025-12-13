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
export const runBestPlayersCron = async () => {
    console.log("BestPlayersCron START");

    const client = await pool.connect();

    try {
        // “ayer” según Argentina
        const todayARG = toYYYYMMDD(getARGDate());
        const yesterdayARG = addDaysStr(todayARG, -1);

        console.log("BestPlayersCron yesterdayARG:", yesterdayARG);

        // 1) Insertar día si no existe (para AYER ARG)
        const dayRes = await client.query(
            `
      INSERT INTO hoopstats.days(date)
      VALUES ($1)
      ON CONFLICT (date) DO UPDATE SET date = EXCLUDED.date
      RETURNING id
      `,
            [yesterdayARG]
        );

        const dayId = dayRes.rows[0].id;

        // 2) Traer juegos de ayer + hoy (por si la API corta día distinto)
        const [gY, gT] = await Promise.all([
            apiGet("/games", { date: yesterdayARG, season: SEASON }),
            apiGet("/games", { date: todayARG, season: SEASON }),
        ]);

        let gamesAll: any[] = [...(gY || []), ...(gT || [])];

        // dedupe por id
        gamesAll = Array.from(new Map(gamesAll.map(g => [g.id, g])).values());

        // filtrar los que realmente fueron AYER en ARG
        const gamesYesterdayARG = gamesAll
            .map((g: any) => ({
                ...g,
                argStart: convertUTCtoARG(g.date?.start),
            }))
            .filter((g: any) => g.argStart && toYYYYMMDD(g.argStart) === yesterdayARG);

        const finishedGames = gamesYesterdayARG.filter((g: any) =>
            ["Finished", "Final", "FT"].includes(g?.status?.long)
        );

        console.log("Finished games yesterday(ARG):", finishedGames.length);

        if (!finishedGames.length) {
            console.log("BestPlayersCron END (no finished games)");
            return;
        }

        // 3) Obtener estadísticas de cada partido
        const statsArrays = await Promise.all(
            finishedGames.map((g: any) => getStatsForGame(g.id))
        );

        const allStats = statsArrays.flat();

        if (!allStats.length) {
            console.log("BestPlayersCron END (no stats)");
            return;
        }

        // 4) Calcular líderes
        const categories: { key: string; name: string }[] = [
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

        // 5) Guardar en DB (transacción)
        await client.query("BEGIN");

        await client.query(
            `DELETE FROM hoopstats.best_players_by_day WHERE day_id = $1`,
            [dayId]
        );

        for (const l of leaders) {
            await client.query(
                `
        INSERT INTO hoopstats.best_players_by_day
        (day_id, category, player_name, player_id, value)
        VALUES ($1, $2, $3, $4, $5)
        `,
                [dayId, l.category, l.player, l.player_id, l.value]
            );
        }

        await client.query("COMMIT");

        console.log("BestPlayersCron END OK", { leaders: leaders.length });
    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch { }
        console.error("Error en BestPlayersCron:", err);
        throw err; 
    } finally {
        client.release();
    }
};
