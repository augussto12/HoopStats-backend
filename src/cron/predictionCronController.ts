import { pool } from "../db";
import axios from "axios";

export const runPredictionCron = async () => {
    try {
        console.log("🔵 Ejecutando cron de predicciones...");

        // 1. Traer las predicciones NO procesadas
        const { rows: pendientes } = await pool.query(
            `SELECT * FROM hoopstats.predicciones WHERE procesada = false`
        );

        if (pendientes.length === 0) {
            console.log("⏹ No hay predicciones pendientes");
            return;
        }

        // Cache para no repetir llamadas
        const gameCache = new Map<number, any>();
        const scoreCache = new Map<string, number>();

        for (const pred of pendientes) {
            try {
                const gameId = pred.game_id;

                // 2. Obtener partido (desde cache o API)
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

                // 3. Si el partido NO terminó → no se procesa
                if (game.status.long !== "Finished") continue;

                const realHome = game.scores.home.points;
                const realAway = game.scores.visitors.points;

                // 4. Cache de cálculo de puntos
                const cacheKey = `${pred.puntos_local_prediccion}|${pred.puntos_visitante_prediccion}|${realHome}|${realAway}`;

                let puntos: number;

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

                // 5. Actualizar predicción
                await pool.query(
                    `UPDATE hoopstats.predicciones
                     SET puntos_obtenidos = $1, procesada = true
                     WHERE id = $2`,
                    [puntos, pred.id]
                );

                // 6. Sumar puntos al usuario
                await pool.query(
                    `UPDATE hoopstats.users
                     SET totalpredictionpoints = totalpredictionpoints + $1
                     WHERE id = $2`,
                    [puntos, pred.user_id]
                );

            } catch (err) {
                console.error("❌ Error procesando predicción:", err);
            }
        }

        console.log("🟢 Cron de predicciones finalizado");
    } catch (err) {
        console.error("🔥 Error en runPredictionCron:", err);
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
