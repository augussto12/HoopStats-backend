import { Router } from "express";
import { auth } from "../middlewares/auth";
import { getMyProfile, updateProfile, updatePassword, getAllUsers, deleteAccount } from "../controllers/usersController";
import { updateProfileSchema } from "../validators/auth";
import { validate } from "../middlewares/validate";

const router = Router();

// PERFIL
router.get("/me", auth, getMyProfile);
router.patch("/me", auth, validate(updateProfileSchema), updateProfile);

// PASSWORD
router.patch("/password", auth, updatePassword);

// CUENTA
router.delete("/me", auth, deleteAccount);

// SOLO ADMIN PARA FUTURO
router.get("/", auth, getAllUsers);

export default router;
