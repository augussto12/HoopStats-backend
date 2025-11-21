import { Router } from "express";
import { getAllPlayers, getPlayerById, getPlayersByTeam } from "../controllers/playerController";
import { auth } from "../middlewares/auth";

const router = Router();

router.get("/", auth, getAllPlayers);
router.get("/:id", auth, getPlayerById);
router.get("/team/:teamId", auth, getPlayersByTeam);

export default router;
