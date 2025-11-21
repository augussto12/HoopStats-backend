import { pool } from "../db";
import axios from "axios";
import { calcFantasyPoints } from "../utils/fantasy";

const API_URL = process.env.NBA_API_BASE_URL!;
const API_KEY = process.env.NBA_API_KEY!;
const SEASON = process.env.FANTASY_SEASON || "2025";

const headers = { "x-apisports-key": API_KEY };

// ----------------------------
// helpers
// ----------------------------

function toArgentina(dateUTC: string) {
    return new Date(
        new Date(dateUTC).toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );
}

function isYesterdayValidArgStart(dateUTC: string): boolean {
    const local = toArgentina(dateUTC);
    return local.getHours() >= 7; // >= 07:00 AM Argentina
}

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
// CRON PRINCIPAL NUEVO
// ----------------------------

export const runFantasyCron = async () => {
    try {
        console.log("🔵 Ejecutando cron de fantasy...");

        const todayARG = getArgentinaDate(0);
        const yesterdayARG = getArgentinaDate(-1);

        const gamesToday = await apiGet("/games", {
            date: todayARG,
            season: SEASON,
        });

        const gamesYesterday = await apiGet("/games", {
            date: yesterdayARG,
            season: SEASON,
        });

        const finishedToday = gamesToday.filter(
            (g: any) => g.status.long === "Finished"
        );

        const finishedYesterday = gamesYesterday
            .filter((g: any) => g.status.long === "Finished")
            .filter((g: any) => isYesterdayValidArgStart(g.date.start));

        const finishedGames = [...finishedToday, ...finishedYesterday];

        if (finishedGames.length === 0) {
            return { updated: false, reason: "No hay partidos válidos" };
        }

        // 3. Obtener fantasy players
        const fpRes = await pool.query(`
          SELECT fp.id, fp.fantasy_team_id, fp.player_id
          FROM hoopstats.fantasy_players fp
        `);

        const fantasyPlayers = fpRes.rows;

        if (fantasyPlayers.length === 0) {
            return { updated: false, reason: "No hay jugadores en fantasy" };
        }

        // Mapa player_id → registros fantasy
        const fantasyByPlayer = new Map<number, any[]>();

        for (const fp of fantasyPlayers) {
            if (!fantasyByPlayer.has(fp.player_id)) {
                fantasyByPlayer.set(fp.player_id, []);
            }
            fantasyByPlayer.get(fp.player_id)!.push(fp);
        }

        // 4. TEAM IDs involucrados
        const teamIds = new Set<number>();

        for (const g of finishedGames) {
            teamIds.add(g.teams.home.id);
            teamIds.add(g.teams.visitors.id);
        }

        // 5. Procesar stats
        const playerPointsMap = new Map<number, number>();

        for (const teamId of teamIds) {
            const stats = await apiGet("/players/statistics", {
                season: SEASON,
                team: teamId,
            });

            for (const s of stats) {
                const playerId = s.player.id;

                if (!fantasyByPlayer.has(playerId)) continue;
                if (!finishedGames.find((g) => g.id === s.game.id)) continue;

                if (typeof s.min !== "number" || s.min < 2) continue;

                const pts = Number(calcFantasyPoints(s).toFixed(1));
                if (pts === 0) continue;

                const prev = playerPointsMap.get(playerId) || 0;
                playerPointsMap.set(playerId, prev + pts);
            }
        }

        if (playerPointsMap.size === 0) {
            return { updated: false, reason: "No hubo puntos" };
        }

        // 6. Guardar en DB
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const teamPointsMap = new Map<number, number>();

            for (const [playerId, pts] of playerPointsMap.entries()) {
                const fps = fantasyByPlayer.get(playerId)!;

                for (const fp of fps) {
                    await client.query(
                        `UPDATE hoopstats.fantasy_players
                         SET total_pts = COALESCE(total_pts, 0) + $1
                         WHERE id = $2`,
                        [pts, fp.id]
                    );

                    const current = teamPointsMap.get(fp.fantasy_team_id) || 0;
                    teamPointsMap.set(fp.fantasy_team_id, current + pts);
                }
            }

            for (const [teamId, pts] of teamPointsMap.entries()) {
                await client.query(
                    `UPDATE hoopstats.fantasy_teams
                     SET total_points = COALESCE(total_points, 0) + $1
                     WHERE id = $2`,
                    [pts, teamId]
                );
            }

            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            console.error("❌ Error guardando puntos:", err);
            return { updated: false, reason: "Error guardando puntos" };
        } finally {
            client.release();
        }

        return {
            updated: true,
            playersUpdated: playerPointsMap.size,
        };
    } catch (err) {
        console.error("🔥 Error en runFantasyCron:", err);
        return { updated: false, reason: "Error general" };
    }
};
