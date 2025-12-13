import { pool } from "../db";
import axios from "axios";

const API_KEY = process.env.NBA_API_KEY!;
const API_BASE = "https://v2.nba.api-sports.io";

function calcularPuntos(
    predHome: number,
    predAway: number,
    realHome: number,
    realAway: number
) {
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

export const runPredictionCron = async () => {
    console.log("PredictionCron START");

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // si se ejecuta en paralelo, cada ejecución se lleva un “lote” sin pisarse
        const { rows: pendientes } = await client.query(
            `
      SELECT *
      FROM hoopstats.predicciones
      WHERE procesada = false
      FOR UPDATE SKIP LOCKED
      `
        );

        console.log("Predicciones pendientes:", pendientes.length);

        if (pendientes.length === 0) {
            await client.query("COMMIT");
            console.log("PredictionCron END (no-op)");
            return;
        }

        const gameCache = new Map<number, any>();
        const scoreCache = new Map<string, number>();

        let procesadas = 0;

        for (const pred of pendientes) {
            try {
                const gameId = pred.game_id;

                let game = gameCache.get(gameId);
                if (!game) {
                    const apiResp = await axios.get(`${API_BASE}/games`, {
                        headers: { "x-apisports-key": API_KEY },
                        params: { id: gameId },
                        timeout: 15000, // evita colgar
                    });

                    game = apiResp.data?.response?.[0];
                    if (!game) continue;

                    gameCache.set(gameId, game);
                }

                if (game?.status?.long !== "Finished") continue;

                const realHome = Number(game?.scores?.home?.points ?? 0);
                const realAway = Number(game?.scores?.visitors?.points ?? 0);

                const cacheKey = `${pred.puntos_local_prediccion}|${pred.puntos_visitante_prediccion}|${realHome}|${realAway}`;
                const puntos =
                    scoreCache.get(cacheKey) ??
                    calcularPuntos(
                        pred.puntos_local_prediccion,
                        pred.puntos_visitante_prediccion,
                        realHome,
                        realAway
                    );

                scoreCache.set(cacheKey, puntos);

                // Idempotencia extra: solo actualiza si sigue sin procesar
                const updPred = await client.query(
                    `
          UPDATE hoopstats.predicciones
          SET puntos_obtenidos = $1,
              puntos_local_real = $2,
              puntos_visitante_real = $3,
              procesada = true
          WHERE id = $4
            AND procesada = false
          RETURNING user_id
          `,
                    [puntos, realHome, realAway, pred.id]
                );

                // si otra ejecución ya la procesó, no sumes puntos
                if (updPred.rowCount === 0) continue;

                await client.query(
                    `
          UPDATE hoopstats.users
          SET total_prediction_points = COALESCE(total_prediction_points, 0) + $1
          WHERE id = $2
          `,
                    [puntos, pred.user_id]
                );

                procesadas++;
            } catch (err) {
                console.error("Error procesando pred individual:", err);
            }
        }

        await client.query("COMMIT");
        console.log("PredictionCron END OK", { procesadas });
    } catch (err) {
        console.error("Error general en PredictionCron:", err);
        try {
            await client.query("ROLLBACK");
        } catch { }
        throw err; 
    } finally {
        client.release();
    }
};
