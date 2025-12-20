import { pool } from "../db";

// GET /best-players/latest
export const getBestPlayersLatest = async (req: any, res: any) => {
    try {
        const dayRes = await pool.query(`
            SELECT id, date 
            FROM hoopstats.days 
            ORDER BY date DESC 
            LIMIT 1
        `);

        if (dayRes.rows.length === 0) {
            return res.json([]);
        }

        const dayId = dayRes.rows[0].id;

        const playersRes = await pool.query(`
            SELECT category, player_name AS player, value
            FROM hoopstats.best_players_by_day
            WHERE day_id = $1
            ORDER BY CASE
                WHEN category = 'Puntos' THEN 1
                WHEN category = 'Rebotes' THEN 2
                WHEN category = 'Asistencias' THEN 3
                WHEN category = 'Tapones' THEN 4
                WHEN category = 'Robos' THEN 5
                WHEN category = 'Triples' THEN 6
                ELSE 7
            END
        `, [dayId]);

        return res.json(playersRes.rows);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error obteniendo best players." });
    }
};

// GET /best-players/:date
export const getBestPlayersByDate = async (req: any, res: any) => {
    try {
        const { date } = req.params;

        const dayRes = await pool.query(`
            SELECT id
            FROM hoopstats.days
            WHERE date = $1
        `, [date]);

        if (!dayRes.rows.length) {
            return res.json([]);
        }

        const dayId = dayRes.rows[0].id;

        const playersRes = await pool.query(`
            SELECT category, player_name AS player, value
            FROM hoopstats.best_players_by_day
            WHERE day_id = $1
            ORDER BY CASE
                WHEN category = 'Puntos' THEN 1
                WHEN category = 'Rebotes' THEN 2
                WHEN category = 'Asistencias' THEN 3
                WHEN category = 'Tapones' THEN 4
                WHEN category = 'Robos' THEN 5
                WHEN category = 'Triples' THEN 6
                ELSE 7
            END
        `, [dayId]);

        return res.json(playersRes.rows);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error obteniendo best players por fecha." });
    }
};

// GET /best-players/team/:teamId/:date
export const getTeamScoresByDate = async (req: any, res: any) => {
    try {
        const { teamId, date } = req.params;

        const scoresRes = await pool.query(`
            SELECT 
                p.full_name,
                h.points_earned as pts
            FROM hoopstats_test.fantasy_team_player_points_history h
            JOIN hoopstats_test.players p ON h.player_id = p.id
            WHERE h.fantasy_team_id = $1 AND h.date = $2
            ORDER BY h.points_earned DESC
        `, [teamId, date]);

        const players = scoresRes.rows;

        // Sumamos los puntos_earned que ya tenés en la tabla
        const total_day_points = players.reduce((sum, p) => sum + parseFloat(p.pts || 0), 0);

        return res.json({
            date,
            total_day_points,
            players: players.map(p => ({
                ...p,
                pts: parseFloat(p.pts) // Asegurar que sea número
            }))
        });

    } catch (err) {
        console.error("Error en getTeamScoresByDate:", err);
        return res.status(500).json({ error: "Error obteniendo puntos históricos." });
    }
};

export const getDreamTeam = async (req: any, res: any) => {
    try {
        const query = `
            SELECT 
                p.full_name, 
                t.logo AS team_logo, 
                dt.total_points AS fantasy_points_week
            FROM hoopstats.weekly_dream_team dt
            JOIN hoopstats.players p ON dt.player_id = p.id
            JOIN hoopstats.teams t ON p.team_id = t.id
            WHERE dt.week_number = (SELECT MAX(week_number) FROM hoopstats.weekly_dream_team)
              AND dt.year = (SELECT MAX(year) FROM hoopstats.weekly_dream_team)
            ORDER BY dt.total_points DESC
        `;

        const result = await pool.query(query);
        return res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener Dream Team:", err);
        return res.status(500).json({ error: "Error al obtener quinteto" });
    }
};