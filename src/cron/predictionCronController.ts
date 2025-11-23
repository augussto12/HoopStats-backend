import { pool } from "../db";
import axios from "axios";

export const runPredictionCron = async () => {
    console.log("Ejecutando cron de predicciones...");

    try {
        // 1. Predicciones NO procesadas
        const { rows: pendientes } = await pool.query(
            `SELECT * FROM hoopstats.predicciones WHERE procesada = false`
        );

        console.log(`Predicciones pendientes: ${pendientes.length}`);

        if (pendientes.length === 0) return;

        // Cache
        const gameCache = new Map<number, any>();
        const scoreCache = new Map<string, number>();

        // Abrimos una transacción
        const client = await pool.connect();
        await client.query("BEGIN");

        try {
            let procesadas = 0;

            for (const pred of pendientes) {
                try {
                    const gameId = pred.game_id;

                    // 2. Obtener partido (cache → API)
                    let game;
                    if (gameCache.has(gameId)) {
                        game = gameCache.get(gameId);
                    } else {
                        const apiResp = await axios.get(
                            `https://v2.nba.api-sports.io/games?id=${gameId}`,
                            {
                                headers: {
                                    "x-apisports-key": process.env.NBA_API_KEY!,
                                },
                            }
                        );
                        game = apiResp.data?.response?.[0];
                        if (!game) continue;

                        gameCache.set(gameId, game);
                    }

                    // Solo procesar si terminó
                    if (game.status.long !== "Finished") continue;

                    const realHome = game.scores.home.points;
                    const realAway = game.scores.visitors.points;

                    // 3. Calcular puntos (cacheado)
                    const cacheKey = `${pred.puntos_local_prediccion}|${pred.puntos_visitante_prediccion}|${realHome}|${realAway}`;
                    let puntos;

                    if (scoreCache.has(cacheKey)) {
                        puntos = scoreCache.get(cacheKey)!;
                    } else {
                        puntos = calcularPuntos(
                            pred.puntos_local_prediccion,
                            pred.puntos_visitante_prediccion,
                            realHome,
                            realAway
                        );
                        scoreCache.set(cacheKey, puntos);
                    }

                    // 4. Actualizar predicción
                    await client.query(
                        `UPDATE hoopstats.predicciones
                         SET puntos_obtenidos = $1, procesada = true
                         WHERE id = $2`,
                        [puntos, pred.id]
                    );

                    // 5. Sumar puntos al usuario
                    await client.query(
                        `UPDATE hoopstats.users
                         SET total_prediction_points = COALESCE(total_prediction_points, 0) + $1
                         WHERE id = $2`,
                        [puntos, pred.user_id]
                    );

                    console.log(`Pred #${pred.id} → User ${pred.user_id} +${puntos} pts`);
                    procesadas++;

                } catch (err) {
                    console.error("Error procesando pred individual:", err);
                }
            }

            await client.query("COMMIT");
            console.log(`Cron finalizado → ${procesadas} predicciones procesadas.`);

        } catch (err) {
            console.error("Error en DB, ejecutando ROLLBACK:", err);
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }

    } catch (err) {
        console.error("Error general en runPredictionCron:", err);
    }
};

// -------------------------
// LÓGICA DE PUNTOS
// -------------------------
function calcularPuntos(predHome: number, predAway: number, realHome: number, realAway: number) {
    let pts = 0;

    const predWinner = predHome > predAway ? "home" : "away";
    const realWinner = realHome > realAway ? "home" : "away";

    const exacto = predHome === realHome && predAway === realAway;
    const aproximado =
        Math.abs(predHome - realHome) <= 5 &&
        Math.abs(predAway - realAway) <= 5;

    if (exacto) return 15;

    if (predWinner === realWinner) pts += 2;
    if (aproximado) pts += 5;

    return pts;
}
