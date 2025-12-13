import { pool } from "../db";
import axios from "axios";
import { calcFantasyPoints } from "../utils/fantasy";

const API_URL = process.env.NBA_API_BASE_URL!;
const API_KEY = process.env.NBA_API_KEY!;
const SEASON = process.env.FANTASY_SEASON || "2025";

const headers = { "x-apisports-key": API_KEY };

// ----------------------------
// Helpers fecha ARG
// ----------------------------
function pad(n: number) {
    return String(n).padStart(2, "0");
}

function toYYYYMMDD(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getArgentinaDate(offsetDays: number = 0) {
    const now = new Date(
        new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );
    now.setDate(now.getDate() + offsetDays);
    return toYYYYMMDD(now);
}

async function apiGet(path: string, params: any = {}) {
    if (!API_URL || !API_KEY) {
        throw new Error("NBA_API_BASE_URL o NBA_API_KEY no configurados");
    }

    const url = `${API_URL}${path}`;
    const res = await axios.get(url, {
        headers,
        params,
        timeout: 15000, // ✅ evita colgarse
    });
    return res.data.response ?? [];
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
    console.log("FantasyCron START");

    try {
        const todayARG = getArgentinaDate(0);
        const yesterdayARG = getArgentinaDate(-1);

        // 1) Obtener partidos de AYER + HOY
        const [gamesToday, gamesYesterday] = await Promise.all([
            apiGet("/games", { date: todayARG, season: SEASON }),
            apiGet("/games", { date: yesterdayARG, season: SEASON }),
        ]);

        const finishedGames = [...gamesYesterday, ...gamesToday].filter(
            (g: any) => g?.status?.long === "Finished"
        );

        console.log(
            `Total partidos finalizados (ayer + hoy): ${finishedGames.length}`
        );

        if (finishedGames.length === 0) {
            console.log("FantasyCron END (no finished games)");
            return;
        }

        // Reset trades si hubo juegos finalizados
        await pool.query(`
      UPDATE hoopstats.fantasy_teams
      SET trades_remaining = 2
    `);

        // 2) Filtrar partidos NO procesados (1 sola query)
        const finishedIds = finishedGames.map((g: any) => g.id);
        const processedRes = await pool.query(
            `SELECT game_id
       FROM hoopstats.fantasy_games_processed
       WHERE game_id = ANY($1::int[])`,
            [finishedIds]
        );

        const processedSet = new Set<number>(
            processedRes.rows.map((r: any) => Number(r.game_id))
        );

        const gamesToProcess = finishedGames.filter(
            (g: any) => !processedSet.has(g.id)
        );

        if (gamesToProcess.length === 0) {
            console.log("FantasyCron END (no new games to process)");
            return;
        }

        // 3) Obtener jugadores fantasy
        const fpRes = await pool.query(`
      SELECT id, fantasy_team_id, player_id
      FROM hoopstats.fantasy_players
    `);

        const fantasyPlayers = fpRes.rows;
        if (fantasyPlayers.length === 0) {
            console.log("FantasyCron END (no fantasy players)");
            return;
        }

        const fantasyByPlayer = new Map<number, any[]>();
        for (const fp of fantasyPlayers) {
            const list = fantasyByPlayer.get(fp.player_id) ?? [];
            list.push(fp);
            fantasyByPlayer.set(fp.player_id, list);
        }

        // 4) Obtener stats por cada equipo involucrado
        const teamIds = new Set<number>();
        for (const g of gamesToProcess as any[]) {
            teamIds.add(g.teams.home.id);
            teamIds.add(g.teams.visitors.id);
        }

        const gameIdSet = new Set<number>(gamesToProcess.map((g: any) => g.id));
        const playerPointsMap = new Map<number, number>();

        for (const teamId of teamIds) {
            const stats = await apiGet("/players/statistics", {
                team: teamId,
                season: SEASON,
            });

            for (const s of stats as any[]) {
                const playerId = s.player.id;

                if (!fantasyByPlayer.has(playerId)) continue;
                if (parseMinutes(s.min) < 2) continue;
                if (!gameIdSet.has(s.game.id)) continue;

                const pts = Number(calcFantasyPoints(s).toFixed(1));
                if (pts === 0) continue;

                playerPointsMap.set(playerId, (playerPointsMap.get(playerId) || 0) + pts);
            }
        }

        if (playerPointsMap.size === 0) {
            console.log("FantasyCron END (no points to add)");
            return;
        }

        // 5) Guardar en DB (transacción)
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

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
                    teamPointsMap.set(
                        fp.fantasy_team_id,
                        (teamPointsMap.get(fp.fantasy_team_id) || 0) + pts
                    );
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

            // 5.3 BIS Sumar puntos a fantasy_league_teams
            for (const [teamId, pts] of teamPointsMap.entries()) {
                const leaguesRes = await client.query(
                    `SELECT league_id
           FROM hoopstats.fantasy_league_teams
           WHERE fantasy_team_id = $1`,
                    [teamId]
                );

                for (const row of leaguesRes.rows) {
                    await client.query(
                        `UPDATE hoopstats.fantasy_league_teams
             SET points = COALESCE(points, 0) + $1
             WHERE fantasy_team_id = $2 AND league_id = $3`,
                        [pts, teamId, row.league_id]
                    );
                }
            }

            // 5.4 Registrar games procesados
            for (const g of gamesToProcess as any[]) {
                await client.query(
                    `INSERT INTO hoopstats.fantasy_games_processed (game_id)
           VALUES ($1)
           ON CONFLICT DO NOTHING`,
                    [g.id]
                );
            }

            await client.query("COMMIT");
            console.log("FantasyCron END OK");
        } catch (err) {
            console.error("FantasyCron DB ERROR:", err);
            await client.query("ROLLBACK");
            throw err; 
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error general del FantasyCron:", err);
        throw err; 
    }
};
