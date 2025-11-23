import { Router } from "express";
import {
    getBestPlayersLatest,
    getBestPlayersByDate
} from "../controllers/bestPlayersController";

const router = Router();

router.get("/latest", getBestPlayersLatest);
router.get("/:date", getBestPlayersByDate);

export default router;
