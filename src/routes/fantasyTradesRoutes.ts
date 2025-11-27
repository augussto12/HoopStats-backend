import { Router } from "express";
import { auth } from "../middlewares/auth";

import {
    getGroupedTradesByTeam,
    getGroupedTradesByLeague,
    getLeagueMarket
} from "../controllers/fantasyTradesController";

const router = Router();

/*  
──────────────────────────────────────────────
              TRADES PÚBLICOS / PRIVADOS
──────────────────────────────────────────────
*/

// Historial de trades por equipo (público)
router.get("/team/:teamId/trades", getGroupedTradesByTeam);

// Historial de trades por liga (privado)
router.get("/:leagueId/trades", auth, getGroupedTradesByLeague);

// Mercado de la liga (privado)
router.get("/:leagueId/market", auth, getLeagueMarket);

export default router;
