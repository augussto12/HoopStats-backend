import { pool } from "../db";

// Obtener equipo fantasy
export const getMyTeam = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const teamRes = await pool.query(
            "SELECT * FROM hoopstats.fantasy_teams WHERE user_id = $1",
            [userId]
        );

        if (teamRes.rows.length === 0)
            return res.json({ message: "No tenés equipo creado" });

        const team = teamRes.rows[0];

        const playersRes = await pool.query(
            `SELECT fp.id, fp.player_id, p.full_name, p.price, p.team_id
       FROM hoopstats.fantasy_players fp
       JOIN hoopstats.players p ON p.id = fp.player_id
       WHERE fp.fantasy_team_id = $1`,
            [team.id]
        );

        return res.json({ team, players: playersRes.rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener el equipo" });
    }
};

// Crear equipo fantasy
export const createTeam = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { name } = req.body;

        const existing = await pool.query(
            "SELECT * FROM hoopstats.fantasy_teams WHERE user_id = $1",
            [userId]
        );

        if (existing.rows.length > 0)
            return res.status(400).json({ error: "Ya tenés un equipo creado" });

        const team = await pool.query(
            `INSERT INTO hoopstats.fantasy_teams (user_id, name)
       VALUES ($1, $2)
       RETURNING *`,
            [userId, name || "Mi equipo"]
        );

        return res.json({
            message: "Equipo creado",
            team: team.rows[0]
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al crear el equipo" });
    }
};

// Agregar jugador al equipo
export const addPlayer = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const playerId = parseInt(req.params.playerId);

        // Validar jugador existe
        const playerRes = await pool.query(
            "SELECT * FROM hoopstats.players WHERE id = $1",
            [playerId]
        );
        if (playerRes.rows.length === 0)
            return res.status(404).json({ error: "El jugador no existe" });

        // Obtener equipo del usuario
        const teamRes = await pool.query(
            "SELECT * FROM hoopstats.fantasy_teams WHERE user_id = $1",
            [userId]
        );
        if (teamRes.rows.length === 0)
            return res.status(400).json({ error: "El usuario no tiene equipo" });

        const teamId = teamRes.rows[0].id;

        // Validar jugador duplicado
        const duplicate = await pool.query(
            `SELECT * FROM hoopstats.fantasy_players
       WHERE fantasy_team_id = $1 AND player_id = $2`,
            [teamId, playerId]
        );

        if (duplicate.rows.length > 0)
            return res.status(400).json({ error: "El jugador ya está en tu equipo" });

        // Insertar jugador
        const insert = await pool.query(
            `INSERT INTO hoopstats.fantasy_players (fantasy_team_id, player_id, price)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [teamId, playerId, playerRes.rows[0].price]
        );

        return res.json({
            message: "Jugador agregado",
            added: insert.rows[0]
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al agregar jugador" });
    }
};

// Eliminar jugador del equipo
export const removePlayer = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const playerId = parseInt(req.params.playerId);

        const teamRes = await pool.query(
            "SELECT * FROM hoopstats.fantasy_teams WHERE user_id = $1",
            [userId]
        );

        if (teamRes.rows.length === 0)
            return res.status(400).json({ error: "No tenés equipo" });

        const teamId = teamRes.rows[0].id;

        const deleted = await pool.query(
            `DELETE FROM hoopstats.fantasy_players 
       WHERE fantasy_team_id = $1 AND player_id = $2
       RETURNING *`,
            [teamId, playerId]
        );

        if (deleted.rows.length === 0)
            return res.status(400).json({ error: "Ese jugador no estaba en tu equipo" });

        return res.json({
            message: "Jugador eliminado",
            deleted: deleted.rows[0]
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al eliminar jugador" });
    }
};

// Listar jugadores del fantasy
export const getTeamPlayers = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const teamRes = await pool.query(
            "SELECT id FROM hoopstats.fantasy_teams WHERE user_id = $1",
            [userId]
        );

        if (teamRes.rows.length === 0)
            return res.status(400).json({ error: "No tenés equipo" });

        const teamId = teamRes.rows[0].id;

        const playersRes = await pool.query(
            `SELECT fp.player_id, p.full_name, p.price, p.team_id
       FROM hoopstats.fantasy_players fp
       JOIN hoopstats.players p ON p.id = fp.player_id
       WHERE fantasy_team_id = $1`,
            [teamId]
        );

        return res.json(playersRes.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener jugadores" });
    }
};