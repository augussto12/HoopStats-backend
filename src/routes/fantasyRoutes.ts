import { Router } from "express";
import { auth } from "../middlewares/auth";

import {
  getMyTeam,
  createTeam,
  addPlayer,
  removePlayer,
  getRanking
} from "../controllers/fantasyController";

const router = Router();

//   MI EQUIPO
router.get("/my-team", auth, getMyTeam);
router.post("/create", auth, createTeam);

//   JUGADORES
router.post("/add-player/:playerId", auth, addPlayer);
router.delete("/remove-player/:playerId", auth, removePlayer);

//   RANKING GLOBAL
router.get("/ranking", getRanking);

export default router;
