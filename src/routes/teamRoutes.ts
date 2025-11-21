import { Router } from "express";
import { getAllTeams,getTeamById } from "../controllers/teamsController";
import { auth } from "../middlewares/auth";

const router = Router();

router.get("/", auth, getAllTeams);
router.get("/:id", auth, getTeamById);

export default router;
