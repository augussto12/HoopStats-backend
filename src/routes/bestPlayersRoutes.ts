import { Router } from "express";
import {
    getBestPlayersLatest,
    getBestPlayersByDate,
    getTeamScoresByDate,
    getDreamTeam
} from "../controllers/bestPlayersController";

const router = Router();

// 1. Rutas estáticas/específicas PRIMERO
router.get("/latest", getBestPlayersLatest);
router.get("/dream-team", getDreamTeam);

// 2. Rutas con parámetros después
router.get("/team/:teamId/:date", getTeamScoresByDate);
router.get("/:date", getBestPlayersByDate);

export default router;
