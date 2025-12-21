import { pool } from "../db";

// Obtener todos los equipos
export const getAllTeams = async (req: any, res: any) => {
    try {
        const result = await pool.query(`
      SELECT id, name, logo
      FROM teams
      ORDER BY name ASC
    `);

        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener equipos" });
    }
};

// Obtener un equipo por ID
export const getTeamById = async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id);

        const result = await pool.query(
            `SELECT id, name, logo FROM teams WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: "Equipo no encontrado" });

        return res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener equipo" });
    }
};
