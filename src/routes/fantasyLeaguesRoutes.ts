import { Router } from "express";
import { auth } from "../middlewares/auth";

import {
    createLeague,
    updateLeague,
    getMyLeagues,
    transferAdmin,
    inactivateMember,
    deleteMember,
    getLeagueTeams,
    getLeagueRanking,
    getMyCreatedLeagues,
    getMyAdminStatus,
    getAllLeagues,
    getLeaguesWhereImAdmin,
    getLeagueDetails,
    isMemberOfLeague,
    leaveLeague,
    deleteLeague,
    activateMember
} from "../controllers/fantasyLeaguesController";

const router = Router();

// ─────────────────────────────
//         CRUD LIGA
// ─────────────────────────────
router.post("/", auth, createLeague);
router.put("/:leagueId", auth, updateLeague);
router.delete("/:leagueId", auth, deleteLeague);

// ─────────────────────────────
//         ESTADO E INFO
// ─────────────────────────────
router.get("/my-admin-status", auth, getMyAdminStatus);
router.get("/my-leagues", auth, getMyLeagues);
router.get("/my-created-leagues", auth, getMyCreatedLeagues);
router.get("/admin-leagues", auth, getLeaguesWhereImAdmin);
router.get("/league-details/:leagueId", auth, getLeagueDetails);
router.get("/membership/is-member/:leagueId", auth, isMemberOfLeague);
router.post("/leagues/:leagueId/leave", auth, leaveLeague);

// ─────────────────────────────
//      ADMINISTRACIÓN LIGA
// ─────────────────────────────
router.post("/:leagueId/transfer-admin", auth, transferAdmin);
router.patch("/:leagueId/members/:userId/inactivate", auth, inactivateMember);
router.patch("/:leagueId/members/:userId/activate", auth, activateMember);
router.delete("/:leagueId/members/:userId", auth, deleteMember);

// ─────────────────────────────
//        LEAGUE DATA
// ─────────────────────────────
router.get("/all", auth, getAllLeagues);
router.get("/:leagueId/teams", auth, getLeagueTeams);
router.get("/:leagueId/ranking", auth, getLeagueRanking);

export default router;
