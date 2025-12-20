import { pool } from "../db";
import axios from "axios";
import { calcFantasyPoints } from "../utils/fantasy";
import { createNotification } from "../controllers/notificationController";

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

        console.log(`Total partidos finalizados (ayer + hoy): ${finishedGames.length}`);

        if (finishedGames.length === 0) {
            console.log("FantasyCron END (no finished games)");
            return;
        }

        // Reset trades si hubo juegos finalizados
        await pool.query(`UPDATE hoopstats.fantasy_teams SET trades_remaining = 2`);

        // 2) Filtrar partidos NO procesados
        const finishedIds = finishedGames.map((g: any) => g.id);
        const processedRes = await pool.query(
            `SELECT game_id FROM hoopstats.fantasy_games_processed WHERE game_id = ANY($1::int[])`,
            [finishedIds]
        );

        const processedSet = new Set<number>(processedRes.rows.map((r: any) => Number(r.game_id)));
        const gamesToProcess = finishedGames.filter((g: any) => !processedSet.has(g.id));

        if (gamesToProcess.length === 0) {
            console.log("FantasyCron END (no new games to process)");
            return;
        }

        // 3) Obtener jugadores fantasy con el flag is_captain
        const fpRes = await pool.query(`SELECT id, fantasy_team_id, player_id, is_captain FROM hoopstats.fantasy_players`);
        const fantasyPlayers = fpRes.rows;

        const fantasyByPlayer = new Map<number, any[]>();
        for (const fp of fantasyPlayers) {
            const list = fantasyByPlayer.get(fp.player_id) ?? [];
            list.push(fp);
            fantasyByPlayer.set(fp.player_id, list);
        }

        // 4) Preparar procesamiento
        const teamIds = new Set<number>();
        for (const g of gamesToProcess as any[]) {
            teamIds.add(g.teams.home.id);
            teamIds.add(g.teams.visitors.id);
        }

        const gameIdSet = new Set<number>(gamesToProcess.map((g: any) => g.id));
        const teamPointsAccumulator = new Map<number, number>(); // Para sumar totales por equipo

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // --- PROCESAMIENTO DE STATS ---
            for (const teamId of teamIds) {
                const stats = await apiGet("/players/statistics", { team: teamId, season: SEASON });

                for (const s of stats as any[]) {
                    const playerId = s.player.id;
                    const gameId = s.game.id;

                    if (parseMinutes(s.min) < 2 || !gameIdSet.has(gameId)) continue;

                    const basePts = Number(calcFantasyPoints(s).toFixed(1));
                    if (basePts <= 0) continue;

                    // A) Guardar en historial global (Puntos base, sin x2)
                    const fullName = `${s.player.firstname} ${s.player.lastname}`;
                    await client.query(`
                        INSERT INTO hoopstats.players (id, full_name, team_id, price)
                        VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING
                    `, [playerId, fullName, teamId, 100.00]);

                    await client.query(`
                        INSERT INTO hoopstats.player_fantasy_points_history (player_id, game_id, date_arg, points)
                        VALUES ($1, $2, $3, $4) ON CONFLICT (player_id, game_id) DO NOTHING
                    `, [playerId, gameId, yesterdayARG, basePts]);

                    // B) Si el jugador está en equipos de usuarios, aplicar x2 si es capitán
                    if (fantasyByPlayer.has(playerId)) {
                        const teamsWithThisPlayer = fantasyByPlayer.get(playerId)!;

                        for (const fp of teamsWithThisPlayer) {
                            // LÓGICA CAPITÁN x2
                            const pointsToAward = fp.is_captain ? basePts * 2 : basePts;

                            // Acumular para el total del equipo
                            const currentTotal = teamPointsAccumulator.get(fp.fantasy_team_id) || 0;
                            teamPointsAccumulator.set(fp.fantasy_team_id, currentTotal + pointsToAward);

                            // 1. Historial individual por equipo (Snapshot)
                            await client.query(`
                                INSERT INTO hoopstats.fantasy_team_player_points_history 
                                (fantasy_team_id, player_id, date, points_earned)
                                VALUES ($1, $2, $3, $4)
                                ON CONFLICT (fantasy_team_id, player_id, date) 
                                DO UPDATE SET points_earned = hoopstats.fantasy_team_player_points_history.points_earned + EXCLUDED.points_earned
                            `, [fp.fantasy_team_id, playerId, yesterdayARG, pointsToAward]);

                            // 2. Actualizar puntos totales acumulados en la carta
                            await client.query(
                                `UPDATE hoopstats.fantasy_players SET total_pts = COALESCE(total_pts, 0) + $1 WHERE id = $2`,
                                [pointsToAward, fp.id]
                            );
                        }
                    }
                }
            }

            // 5) Actualizar Equipos, Ligas e Historiales de Equipo
            for (const [teamId, totalDayPts] of teamPointsAccumulator.entries()) {
                // A) Total acumulado del equipo
                await client.query(
                    `UPDATE hoopstats.fantasy_teams SET total_points = COALESCE(total_points, 0) + $1 WHERE id = $2`,
                    [totalDayPts, teamId]
                );

                // B) Historial diario del equipo
                await client.query(
                    `INSERT INTO hoopstats.fantasy_teams_history (fantasy_team_id, date, points_earned)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (fantasy_team_id, date) 
                     DO UPDATE SET points_earned = hoopstats.fantasy_teams_history.points_earned + EXCLUDED.points_earned`,
                    [teamId, yesterdayARG, totalDayPts]
                );

                // C) Actualizar puntos en todas las ligas donde esté el equipo
                await client.query(
                    `UPDATE hoopstats.fantasy_league_teams SET points = COALESCE(points, 0) + $1 
                     WHERE fantasy_team_id = $2`,
                    [totalDayPts, teamId]
                );

                // D) Notificación al usuario
                const teamInfo = await client.query(`SELECT user_id, name FROM hoopstats.fantasy_teams WHERE id = $1`, [teamId]);
                if (teamInfo.rows.length > 0) {
                    const team = teamInfo.rows[0];
                    await createNotification(
                        team.user_id,
                        "FANTASY_POINTS",
                        "Resumen de Jornada",
                        `¡Tu equipo ${team.name} sumó ${totalDayPts} puntos! (Capitán x2 incluido)`,
                        { points: totalDayPts, date: yesterdayARG }
                    );
                }
            }

            // 6) Registrar games procesados
            for (const gameId of gamesToProcess.map((g: any) => g.id)) {
                await client.query(
                    `INSERT INTO hoopstats.fantasy_games_processed (game_id) VALUES ($1) ON CONFLICT DO NOTHING`,
                    [gameId]
                );
            }

            await client.query("COMMIT");
            console.log("FantasyCron END OK");
        } catch (err) {
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