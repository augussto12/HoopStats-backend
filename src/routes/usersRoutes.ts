import { Router } from "express";
import { auth } from "../middlewares/auth";
import { getMyProfile, updateProfile, updatePassword } from "../controllers/usersController";

const router = Router();

router.get("/me", auth, getMyProfile);
router.patch("/update", auth, updateProfile);
router.patch("/update-password", auth, updatePassword);

export default router;
