import { pool } from "../db";
import axios from "axios";
import { calcFantasyPoints } from "../utils/fantasy";

const API_URL = process.env.NBA_API_BASE_URL!;
const API_KEY = process.env.NBA_API_KEY!;
const SEASON = process.env.FANTASY_SEASON || "2025";

const headers = { "x-apisports-key": API_KEY };

// ----------------------------
// Helpers
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

function parseMinutes(minStr: string) {
    if (!minStr) return 0;
    const [m, s] = minStr.split(":").map(Number);
    return m + (s > 0 ? 1 : 0);
}

// ----------------------------
// CRON PRINCIPAL
// ----------------------------
export const runFantasyCron = async () => {
    console.log("Iniciando Fantasy Cron...");

    try {
        const todayARG = getArgentinaDate(0);
        const yesterdayARG = getArgentinaDate(-1);

        // 1. Obtener partidos de AYER + HOY
        const gamesToday = await apiGet("/games", { date: todayARG, season: SEASON });
        const gamesYesterday = await apiGet("/games", { date: yesterdayARG, season: SEASON });

        const finishedGames = [...gamesYesterday, ...gamesToday]
            .filter(g => g.status.long === "Finished");

        if (finishedGames.length > 0) {
            await pool.query(`
                UPDATE hoopstats.fantasy_teams
                SET trades_remaining = 2
            `);
        }

        console.log(`Total partidos finalizados (ayer + hoy): ${finishedGames.length}`);

        if (finishedGames.length === 0) return;

        // 2. Filtrar partidos NO procesados
        const gamesToProcess = [];

        for (const g of finishedGames) {
            const q = await pool.query(
                `SELECT 1 FROM hoopstats.fantasy_games_processed WHERE game_id = $1`,
                [g.id]
            );

            if (q.rows.length === 0) {
                gamesToProcess.push(g);
            }
        }


        if (gamesToProcess.length === 0) {
            return;
        }

        // 3. Obtener jugadores fantasy
        const fpRes = await pool.query(`
            SELECT id, fantasy_team_id, player_id
            FROM hoopstats.fantasy_players
        `);

        const fantasyPlayers = fpRes.rows;

        if (fantasyPlayers.length === 0) {
            return;
        }

        const fantasyByPlayer = new Map<number, any[]>();
        for (const fp of fantasyPlayers) {
            const list = fantasyByPlayer.get(fp.player_id) ?? [];
            list.push(fp);
            fantasyByPlayer.set(fp.player_id, list);
        }

        // 4. Obtener stats por cada equipo involucrado
        const teamIds = new Set<number>();
        for (const g of gamesToProcess) {
            teamIds.add(g.teams.home.id);
            teamIds.add(g.teams.visitors.id);
        }

        const playerPointsMap = new Map<number, number>();

        for (const teamId of teamIds) {
            const stats = await apiGet("/players/statistics", {
                team: teamId,
                season: SEASON,
            });

            for (const s of stats) {
                const playerId = s.player.id;

                // No pertenece al fantasy
                if (!fantasyByPlayer.has(playerId)) continue;

                // Minutos jugados
                if (parseMinutes(s.min) < 2) continue;

                // Este partido está en gamesToProcess?
                if (!gamesToProcess.find(g => g.id === s.game.id)) continue;

                // Calcular puntos
                const pts = Number(calcFantasyPoints(s).toFixed(1));
                if (pts === 0) continue;

                const prev = playerPointsMap.get(playerId) || 0;
                playerPointsMap.set(playerId, prev + pts);
            }
        }

        if (playerPointsMap.size === 0) return;

        // 5. Guardar en DB
        const client = await pool.connect();
        await client.query("BEGIN");

        try {
            // 5.1 Actualizar fantasy_players
            for (const [playerId, pts] of playerPointsMap.entries()) {
                const fps = fantasyByPlayer.get(playerId)!;

                for (const fp of fps) {
                    await client.query(
                        `UPDATE hoopstats.fantasy_players
                         SET total_pts = COALESCE(total_pts, 0) + $1
                         WHERE id = $2`,
                        [pts, fp.id]
                    );
                }
            }

            // 5.2 Sumar puntos por equipo
            const teamPointsMap = new Map<number, number>();

            for (const [playerId, pts] of playerPointsMap.entries()) {
                for (const fp of fantasyByPlayer.get(playerId)!) {
                    const current = teamPointsMap.get(fp.fantasy_team_id) || 0;
                    teamPointsMap.set(fp.fantasy_team_id, current + pts);
                }
            }

            // 5.3 Actualizar fantasy_teams
            for (const [teamId, pts] of teamPointsMap.entries()) {
                await client.query(
                    `UPDATE hoopstats.fantasy_teams
                     SET total_points = COALESCE(total_points, 0) + $1
                     WHERE id = $2`,
                    [pts, teamId]
                );
            }

            // 5.3 BIS → SUMAR PUNTOS A LAS LIGAS DEL EQUIPO
            for (const [teamId, pts] of teamPointsMap.entries()) {
                // obtener ligas del equipo
                const leaguesRes = await client.query(
                    `SELECT league_id 
                    FROM hoopstats.fantasy_league_teams
                    WHERE fantasy_team_id = $1`,
                    [teamId]
                );

                // sumar puntos en cada liga
                for (const row of leaguesRes.rows) {
                    await client.query(
                        `UPDATE hoopstats.fantasy_league_teams
                        SET points = COALESCE(points, 0) + $1
                        WHERE fantasy_team_id = $2
                        AND league_id = $3`,
                        [pts, teamId, row.league_id]
                    );
                }
            }


            // 5.4 Registrar games procesados
            for (const g of gamesToProcess) {
                await client.query(
                    `INSERT INTO hoopstats.fantasy_games_processed (game_id)
                     VALUES ($1)
                     ON CONFLICT DO NOTHING`,
                    [g.id]
                );
            }

            await client.query("COMMIT");

        } catch (err) {
            console.error("Error en DB:", err);
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }

    } catch (err) {
        console.error("Error general del cron:", err);
    }
};
