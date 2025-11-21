import { Router } from "express";
import { register, login } from "../controllers/authController";
import { deleteAccount } from "../controllers/usersController";
import { auth } from "../middlewares/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.delete("/me", auth, deleteAccount);

export default router;
