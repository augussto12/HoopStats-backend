import { Router } from "express";
import { auth } from "../middlewares/auth";
import {
  getMyTeam,
  createTeam,
  addPlayer,
  removePlayer,
  getRanking,
  updateTeamName,
  getTradesToday,
  getMyTransactions,
  applyTrades,
  getGroupedTransactionsByTeam
} from "../controllers/fantasyController";

const router = Router();

//   MI EQUIPO
router.get("/my-team", auth, getMyTeam);
router.post("/create", auth, createTeam);
router.put("/update-name", auth, updateTeamName);

//   JUGADORES (cambios individuales)
router.post("/add-player/:playerId", auth, addPlayer);
router.delete("/remove-player/:playerId", auth, removePlayer);

//   TRADES
router.post("/apply-trades", auth, applyTrades);
router.get("/trades/today", auth, getTradesToday);
router.get("/trades/history", auth, getMyTransactions); 
router.get("/trades/history-by-team", auth, getGroupedTransactionsByTeam);
//   RANKING GLOBAL
router.get("/ranking", getRanking);

export default router;
