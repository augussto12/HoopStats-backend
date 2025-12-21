import { pool } from "../db";

// Obtener todos los jugadores
export const getAllPlayers = async (req: any, res: any) => {
    try {
        const result = await pool.query(`
      SELECT p.id, p.full_name, p.price, p.team_id, t.name AS team_name, t.logo
      FROM players p
      JOIN teams t ON t.id = p.team_id
      ORDER BY p.full_name ASC
    `);

        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener jugadores" });
    }
};

// Obtener un jugador por ID
export const getPlayerById = async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id);

        const result = await pool.query(`
      SELECT p.id, p.full_name, p.price, p.team_id, t.name AS team_name, t.logo
      FROM players p
      JOIN teams t ON t.id = p.team_id
      WHERE p.id = $1
    `, [id]);

        if (result.rows.length === 0)
            return res.status(404).json({ error: "Jugador no encontrado" });

        return res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener jugador" });
    }
};

// Obtener jugadores por equipo
export const getPlayersByTeam = async (req: any, res: any) => {
    try {
        const teamId = parseInt(req.params.teamId);

        const result = await pool.query(`
      SELECT p.id, p.full_name, p.price, p.team_id, t.name AS team_name, t.logo
      FROM players p
      JOIN teams t ON t.id = p.team_id
      WHERE t.id = $1
      ORDER BY p.full_name ASC
    `, [teamId]);

        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener jugadores por equipo" });
    }
};
