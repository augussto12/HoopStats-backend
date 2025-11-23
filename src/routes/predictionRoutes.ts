import { Router } from "express";
import { auth } from "../middlewares/auth";
import {
    createPrediction,
    getMyPredictions,
    getPredictionForGame,
    deletePrediction,
    getPredictionsRanking,
    sumarPuntosDePredicciones
} from "../controllers/prediccionesController";


const router = Router();

router.post("/", auth, createPrediction);
router.get("/mine", auth, getMyPredictions);
router.get("/game/:gameId", auth, getPredictionForGame);
router.delete("/:id", auth, deletePrediction);
router.get("/ranking", getPredictionsRanking);
router.post("/sumar-puntos", auth, sumarPuntosDePredicciones);

export default router;
