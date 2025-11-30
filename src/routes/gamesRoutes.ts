import { Router } from "express";
import { getDailyGames } from "../controllers/gamesController";

const router = Router();

router.get("/daily", getDailyGames);

export default router;
