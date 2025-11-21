import { Router } from "express";
import { auth } from "../middlewares/auth";

import {
  getMyTeam,
  createTeam,
  addPlayer,
  removePlayer,
  getTeamPlayers
} from "../controllers/fantasyController";

const router = Router();

router.get("/my-team", auth, getMyTeam);
router.post("/create", auth, createTeam);
router.post("/add-player/:playerId", auth, addPlayer);
router.delete("/remove-player/:playerId", auth, removePlayer);
router.get("/players", auth, getTeamPlayers);

export default router;
