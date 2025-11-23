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
    const url = `${API_URL}${path}`;
    const res = await axios.get(url, { headers, params });
    return res.data.response;
}

// --------------------------
function getYesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
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
    console.log("=== Ejecutando Best Players CRON ===");

    try {
        const date = getYesterday();

        // ==========================================
        // 1) Insertar día si no existe
        // ==========================================
        const dayRes = await pool.query(`
            INSERT INTO hoopstats.days(date)
            VALUES ($1)
            ON CONFLICT (date) DO UPDATE SET date = EXCLUDED.date
            RETURNING id
        `, [date]);

        const dayId = dayRes.rows[0].id;

        // ==========================================
        // 2) Obtener partidos de ayer
        // ==========================================
        const games = await apiGet("/games", {
            date,
            season: SEASON
        });

        const finishedGames = games.filter((g: any) =>
            ["Finished", "Final", "FT"].includes(g.status.long)
        );

        if (!finishedGames.length) {
            console.log("No finished games yesterday.");
            return;
        }

        // ==========================================
        // 3) Obtener estadísticas de cada partido
        // ==========================================
        const statsArrays = await Promise.all(
            finishedGames.map((g: any) => getStatsForGame(g.id))
        );

        const allStats = statsArrays.flat();

        if (!allStats.length) {
            console.log("No stats found.");
            return;
        }

        // ==========================================
        // 4) Calcular líderes
        // ==========================================
        const categories: { key: string; name: string }[] = [
            { key: "points", name: "Puntos" },
            { key: "totReb", name: "Rebotes" },
            { key: "assists", name: "Asistencias" },
            { key: "steals", name: "Robos" },
            { key: "blocks", name: "Tapones" },
            { key: "tpm", name: "Triples" }
        ];

        const leaders: any[] = [];

        for (const c of categories) {
            let best: any = null;

            for (const s of allStats) {
                const statVal = Number(s[c.key]) || 0;

                if (!best || statVal > best.value) {
                    best = {
                        category: c.name,
                        player: `${s.player.firstname} ${s.player.lastname}`,
                        player_id: s.player.id,
                        value: statVal
                    };
                }
            }

            leaders.push(best);
        }

        // ==========================================
        // 5) Guardar en base de datos
        // ==========================================
        const client = await pool.connect();
        await client.query("BEGIN");

        await client.query(
            `DELETE FROM hoopstats.best_players_by_day WHERE day_id = $1`,
            [dayId]
        );

        for (const l of leaders) {
            await client.query(`
                INSERT INTO hoopstats.best_players_by_day
                (day_id, category, player_name, player_id, value)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                dayId,
                l.category,
                l.player,
                l.player_id,
                l.value
            ]);
        }

        await client.query("COMMIT");
        client.release();

        console.log("✨ Best players guardados para", date);

    } catch (err) {
        console.error("❌ Error en Best Players CRON:", err);
    }
};
