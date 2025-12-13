import { pool } from "../db";

const normalizeInt = (value: any) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeScore = (value: any) => {
    const n = Number(value);
    if (!Number.isInteger(n)) return null;
    if (n < 0 || n > 300) return null;
    return n;
};

// Crear predicción
export const createPrediction = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const {
            game_id,
            home_team,
            visitor_team,
            puntos_local_prediccion,
            puntos_visitante_prediccion,
            game_date
        } = req.body ?? {};

        const gameId = normalizeInt(game_id);
        const ptsLocal = normalizeScore(puntos_local_prediccion);
        const ptsVisit = normalizeScore(puntos_visitante_prediccion);

        if (
            !gameId ||
            typeof home_team !== "string" ||
            typeof visitor_team !== "string" ||
            !home_team.trim() ||
            !visitor_team.trim() ||
            ptsLocal === null ||
            ptsVisit === null ||
            !game_date
        ) {
            return res.status(400).json({ error: "Datos inválidos para la predicción." });
        }

        // Evitar duplicado
        const exists = await pool.query(
            `SELECT id FROM hoopstats.predicciones 
             WHERE user_id = $1 AND game_id = $2`,
            [userId, gameId]
        );

        if (exists.rows.length > 0) {
            return res.status(400).json({
                error: "Ya realizaste una predicción para este partido"
            });
        }

        const insert = await pool.query(
            `INSERT INTO hoopstats.predicciones
                (user_id, game_id, game_date, home_team, visitor_team,
                 puntos_local_prediccion, puntos_visitante_prediccion, procesada)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false)
             RETURNING id, user_id, game_id, game_date, home_team, visitor_team,
                       puntos_local_prediccion, puntos_visitante_prediccion, procesada, created_at`,
            [
                userId,
                gameId,
                game_date,
                home_team.trim(),
                visitor_team.trim(),
                ptsLocal,
                ptsVisit
            ]
        );

        return res.json({
            message: "Predicción creada",
            prediction: insert.rows[0]
        });

    } catch (err) {
        console.error("Error creando predicción:", err);
        return res.status(500).json({ error: "Error al crear predicción" });
    }
};

// Obtener mis predicciones
export const getMyPredictions = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT 
                id,
                game_id,
                home_team,
                visitor_team,
                puntos_local_prediccion,
                puntos_visitante_prediccion,
                puntos_local_real,
                puntos_visitante_real,
                puntos_obtenidos,
                procesada,
                created_at,
                TO_CHAR(game_date, 'YYYY-MM-DD') AS game_date
             FROM hoopstats.predicciones
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        return res.json(result.rows);

    } catch (err) {
        console.error("Error al obtener mis predicciones:", err);
        return res.status(500).json({ error: "Error al obtener predicciones" });
    }
};

// Obtener predicción para un partido específico
export const getPredictionForGame = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const gameId = normalizeInt(req.params.gameId);

        if (!gameId) {
            return res.status(400).json({ error: "gameId inválido" });
        }

        const result = await pool.query(
            `SELECT 
                id,
                game_id,
                home_team,
                visitor_team,
                puntos_local_prediccion,
                puntos_visitante_prediccion,
                puntos_local_real,
                puntos_visitante_real,
                puntos_obtenidos,
                procesada,
                created_at,
                TO_CHAR(game_date, 'YYYY-MM-DD') AS game_date
             FROM hoopstats.predicciones
             WHERE user_id = $1 AND game_id = $2`,
            [userId, gameId]
        );

        return res.json(result.rows[0] || null);

    } catch (err) {
        console.error("Error al obtener predicción:", err);
        return res.status(500).json({ error: "Error al obtener predicción" });
    }
};

// Eliminar predicción
export const deletePrediction = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const id = normalizeInt(req.params.id);

        if (!id) {
            return res.status(400).json({ error: "ID de predicción inválido" });
        }

        const result = await pool.query(
            `DELETE FROM hoopstats.predicciones
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "No existe o no pertenece al usuario"
            });
        }

        return res.json({ message: "Predicción eliminada" });

    } catch (err) {
        console.error("Error al borrar predicción:", err);
        return res.status(500).json({ error: "Error al borrar predicción" });
    }
};


export const getPredictionsRanking = async (req: any, res: any) => {
    try {
        const ranking = await pool.query(
            `SELECT 
                u.username,
                u.total_prediction_points
             FROM hoopstats.users u
             ORDER BY u.total_prediction_points DESC`
        );

        return res.json(ranking.rows);

    } catch (err) {
        console.error("Error al obtener ranking de predicciones:", err);
        return res.status(500).json({ error: "Error al obtener ranking" });
    }
};
