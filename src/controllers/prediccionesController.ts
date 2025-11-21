import { pool } from "../db";

// Crear predicción
export const createPrediction = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { playerId, predictedPoints } = req.body;

        if (!playerId || !predictedPoints)
            return res.status(400).json({ error: "Faltan datos" });

        // Validar que el jugador exista
        const player = await pool.query(
            "SELECT * FROM hoopstats.players WHERE id = $1",
            [playerId]
        );
        if (player.rows.length === 0)
            return res.status(404).json({ error: "Jugador no encontrado" });

        const insert = await pool.query(
            `INSERT INTO hoopstats.predictions 
       (user_id, player_id, predicted_points)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [userId, playerId, predictedPoints]
        );

        return res.json({
            message: "Predicción creada",
            prediction: insert.rows[0]
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al crear predicción" });
    }
};

// Obtener predicciones del usuario
export const getMyPredictions = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT p.*, pl.full_name, pl.team_id
       FROM hoopstats.predictions p
       JOIN hoopstats.players pl ON pl.id = p.player_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
            [userId]
        );

        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener predicciones" });
    }
};

// Obtener todas las predicciones (opcional admin)
export const getAllPredictions = async (req: any, res: any) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.email, pl.full_name
       FROM hoopstats.predictions p
       JOIN hoopstats.users u ON u.id = p.user_id
       JOIN hoopstats.players pl ON pl.id = p.player_id
       ORDER BY p.created_at DESC`
        );

        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener predicciones" });
    }
};

// Actualizar puntos reales (lo usará el CRON)
export const updateRealPoints = async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id);
        const { realPoints } = req.body;

        const exists = await pool.query(
            "SELECT * FROM hoopstats.predictions WHERE id = $1",
            [id]
        );
        if (exists.rows.length === 0)
            return res.status(404).json({ error: "Predicción no encontrada" });

        const update = await pool.query(
            `UPDATE hoopstats.predictions 
       SET real_points = $1
       WHERE id = $2
       RETURNING *`,
            [realPoints, id]
        );

        return res.json({
            message: "Puntos reales actualizados",
            updated: update.rows[0]
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al actualizar predicción" });
    }
};

// Borrar predicción
export const deletePrediction = async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id);
        const userId = req.user.userId;

        const result = await pool.query(
            `DELETE FROM hoopstats.predictions
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
            [id, userId]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: "No encontrada o no pertenece al usuario" });

        return res.json({ message: "Predicción eliminada" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al borrar predicción" });
    }
};
