import { Router } from "express";
import { auth } from "../middlewares/auth";

import {
    requestJoinLeague,
    approveJoinRequest,
    rejectJoinRequest,
    cancelRequest,
    inviteUserToLeague,
    acceptInvite,
    rejectInvite,
    cancelInvite,
    promoteToAdmin,
    demoteAdmin,
    getMyInvites,
    getInvitesForMyLeagues, 
    deleteInviteNotification 
} from "../controllers/leaguesMembership";

const router = Router();

// ─────────────────────────────
//           REQUESTS
// ─────────────────────────────
router.post("/leagues/:leagueId/request-join", auth, requestJoinLeague);
router.post("/requests/:requestId/approve", auth, approveJoinRequest);
router.post("/requests/:requestId/reject", auth, rejectJoinRequest);
router.delete("/requests/:requestId/cancel", auth, cancelRequest);

// ─────────────────────────────
//           INVITES
// ─────────────────────────────
router.post("/leagues/:leagueId/invite", auth, inviteUserToLeague);
router.post("/invites/:inviteId/accept", auth, acceptInvite);
router.post("/invites/:inviteId/reject", auth, rejectInvite);
router.delete("/invites/:inviteId/cancel", auth, cancelInvite);

router.get("/my/invites", auth, getMyInvites);
router.get("/my/league-invites", auth, getInvitesForMyLeagues);
router.delete("/invites/:inviteId/delete", auth, deleteInviteNotification);

// ─────────────────────────────
//           ADMIN
// ─────────────────────────────
router.post("/leagues/:leagueId/promote/:userId", auth, promoteToAdmin);
router.post("/leagues/:leagueId/demote/:userId", auth, demoteAdmin);

export default router;
