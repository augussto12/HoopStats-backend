import { pool } from "../db";

// ======================================================
// Crear predicción
// ======================================================
export const createPrediction = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const {
            game_id,
            home_team,
            visitor_team,
            puntos_local_prediccion,
            puntos_visitante_prediccion
        } = req.body;

        // Validación completa
        if (
            !game_id ||
            !home_team ||
            !visitor_team ||
            puntos_local_prediccion == null ||
            puntos_visitante_prediccion == null
        ) {
            return res.status(400).json({ error: "Faltan datos" });
        }

        // Evitar duplicado
        const exists = await pool.query(
            `SELECT id FROM hoopstats.predicciones 
             WHERE user_id = $1 AND game_id = $2`,
            [userId, game_id]
        );

        if (exists.rows.length > 0) {
            return res.status(400).json({
                error: "Ya realizaste una predicción para este partido"
            });
        }

        // Insert real
        const insert = await pool.query(
            `INSERT INTO hoopstats.predicciones
                (user_id, game_id, home_team, visitor_team,
                 puntos_local_prediccion, puntos_visitante_prediccion, procesada)
             VALUES ($1, $2, $3, $4, $5, $6, false)
             RETURNING *`,
            [
                userId,
                game_id,
                home_team,
                visitor_team,
                puntos_local_prediccion,
                puntos_visitante_prediccion
            ]
        );

        return res.json({
            message: "Predicción creada",
            prediction: insert.rows[0]
        });

    } catch (err) {
        console.error("❌ Error creando predicción:", err);
        return res.status(500).json({ error: "Error al crear predicción" });
    }
};

// ======================================================
// Obtener mis predicciones
// ======================================================
export const getMyPredictions = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT *
             FROM hoopstats.predicciones
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        return res.json(result.rows);

    } catch (err) {
        console.error("❌ Error al obtener mis predicciones:", err);
        return res.status(500).json({ error: "Error al obtener predicciones" });
    }
};

// ======================================================
// Obtener predicción para un partido específico
// ======================================================
export const getPredictionForGame = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const gameId = parseInt(req.params.gameId);

        const result = await pool.query(
            `SELECT *
             FROM hoopstats.predicciones
             WHERE user_id = $1 AND game_id = $2`,
            [userId, gameId]
        );

        return res.json(result.rows[0] || null);

    } catch (err) {
        console.error("❌ Error al obtener predicción:", err);
        return res.status(500).json({ error: "Error al obtener predicción" });
    }
};

// ======================================================
// Eliminar predicción
// ======================================================
export const deletePrediction = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const id = parseInt(req.params.id);

        const result = await pool.query(
            `DELETE FROM hoopstats.predicciones
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "No existe o no pertenece al usuario"
            });
        }

        return res.json({ message: "Predicción eliminada" });

    } catch (err) {
        console.error("❌ Error al borrar predicción:", err);
        return res.status(500).json({ error: "Error al borrar predicción" });
    }
};

export const getPredictionsRanking = async (req: any, res: any) => {
    try {
        const ranking = await pool.query(
            `SELECT 
                u.id,
                u.fullname,
                u.username,
                u.email,
                u.total_prediction_points
             FROM hoopstats.users u
             ORDER BY u.total_prediction_points DESC`
        );

        return res.json(ranking.rows);

    } catch (err) {
        console.error("❌ Error al obtener ranking de predicciones:", err);
        return res.status(500).json({ error: "Error al obtener ranking" });
    }
};
