import { pool } from "../db";

// ==========================================================
// Obtener mi equipo de fantasy
// ==========================================================
export const getMyTeam = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        // Obtener equipo
        const teamRes = await pool.query(
            `SELECT id, user_id, name, total_points, budget 
             FROM hoopstats.fantasy_teams
             WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.json({
                team: null,
                players: []
            });
        }

        const team = teamRes.rows[0];

        // Obtener jugadores
        const playersRes = await pool.query(
            `SELECT 
                fp.id AS fantasy_player_id,
                fp.player_id,
                fp.total_pts,
                fp.price,
                p.full_name,
                p.team_id
             FROM hoopstats.fantasy_players fp
             JOIN hoopstats.players p ON p.id = fp.player_id
             WHERE fp.fantasy_team_id = $1`,
            [team.id]
        );

        return res.json({
            team,
            players: playersRes.rows
        });

    } catch (err) {
        console.error("❌ Error al obtener equipo:", err);
        return res.status(500).json({ error: "Error al obtener equipo" });
    }
};

// ==========================================================
// Crear equipo
// ==========================================================
export const createTeam = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { name } = req.body;

        const exists = await pool.query(
            `SELECT * FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (exists.rows.length > 0) {
            return res.status(400).json({ error: "Ya tenés un equipo creado" });
        }

        const team = await pool.query(
            `INSERT INTO hoopstats.fantasy_teams (user_id, name, total_points, budget)
             VALUES ($1, $2, 0, 1000) 
             RETURNING *`,
            [userId, name || "Mi equipo"]
        );

        return res.json({
            message: "Equipo creado",
            team: team.rows[0]
        });

    } catch (err) {
        console.error("❌ Error al crear equipo:", err);
        return res.status(500).json({ error: "Error al crear equipo" });
    }
};

// ==========================================================
// Agregar jugador
// ==========================================================
export const addPlayer = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const playerId = parseInt(req.params.playerId);

        const playerRes = await pool.query(
            "SELECT id, price FROM hoopstats.players WHERE id = $1",
            [playerId]
        );

        if (playerRes.rows.length === 0) {
            return res.status(404).json({ error: "Jugador no encontrado" });
        }

        const player = playerRes.rows[0];

        const teamRes = await pool.query(
            `SELECT id, budget FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "No tenés equipo creado" });
        }

        const team = teamRes.rows[0];

        if (team.budget < player.price) {
            return res.status(400).json({ error: "No tenés presupuesto suficiente" });
        }

        const duplicate = await pool.query(
            `SELECT * FROM hoopstats.fantasy_players
             WHERE fantasy_team_id = $1 AND player_id = $2`,
            [team.id, playerId]
        );

        if (duplicate.rows.length > 0) {
            return res.status(400).json({ error: "El jugador ya está en tu equipo" });
        }

        await pool.query("BEGIN");

        const insert = await pool.query(
            `INSERT INTO hoopstats.fantasy_players (fantasy_team_id, player_id, price)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [team.id, playerId, player.price]
        );

        await pool.query(
            `UPDATE hoopstats.fantasy_teams
             SET budget = budget - $1
             WHERE id = $2`,
            [player.price, team.id]
        );

        await pool.query("COMMIT");

        return res.json({
            message: "Jugador agregado",
            player: insert.rows[0]
        });

    } catch (err) {
        console.error("❌ Error al agregar jugador:", err);
        return res.status(500).json({ error: "Error al agregar jugador" });
    }
};

// ==========================================================
// Eliminar jugador
// ==========================================================
export const removePlayer = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const playerId = parseInt(req.params.playerId);

        const teamRes = await pool.query(
            `SELECT id FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "No tenés equipo" });
        }

        const teamId = teamRes.rows[0].id;

        const player = await pool.query(
            `SELECT * FROM hoopstats.fantasy_players 
             WHERE fantasy_team_id = $1 AND player_id = $2`,
            [teamId, playerId]
        );

        if (player.rows.length === 0) {
            return res.status(404).json({ error: "Ese jugador no está en tu equipo" });
        }

        await pool.query("BEGIN");

        const price = player.rows[0].price;

        await pool.query(
            `DELETE FROM hoopstats.fantasy_players 
             WHERE fantasy_team_id = $1 AND player_id = $2`,
            [teamId, playerId]
        );

        await pool.query(
            `UPDATE hoopstats.fantasy_teams
             SET budget = budget + $1
             WHERE id = $2`,
            [price, teamId]
        );

        await pool.query("COMMIT");

        return res.json({ message: "Jugador eliminado" });

    } catch (err) {
        console.error("❌ Error al eliminar jugador:", err);
        return res.status(500).json({ error: "Error al eliminar jugador" });
    }
};

// ==========================================================
// Ranking Global
// ==========================================================
export const getRanking = async (req: any, res: any) => {
    try {
        const ranking = await pool.query(
            `SELECT
                ft.id,
                ft.name,
                ft.total_points,
                u.username,
                u.email
             FROM hoopstats.fantasy_teams ft
             JOIN hoopstats.users u ON u.id = ft.user_id
             ORDER BY ft.total_points DESC`
        );

        return res.json(ranking.rows);

    } catch (err) {
        console.error("❌ Error al obtener ranking:", err);
        return res.status(500).json({ error: "Error al obtener ranking" });
    }
};
