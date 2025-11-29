import { Router } from "express";
import { register, login, forgotPassword, resetPassword, verifyEmail, resendVerification, me, refresh } from "../controllers/authController";
import { deleteAccount, updateProfile } from "../controllers/usersController";
import { auth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { registerSchema, loginSchema, emailSchema, resetPasswordSchema, updateProfileSchema } from "../validators/auth";

const router = Router();

// PROFILE
router.get("/me", auth, me);
router.put("/auth/me", auth, validate(updateProfileSchema), updateProfile);


// AUTH
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh", auth, refresh);

// EMAIL VERIFICATION
router.post("/resend-verification", validate(emailSchema), resendVerification);
router.get("/verify-email", verifyEmail);


// PASSWORD RECOVERY
router.post("/forgot-password", validate(emailSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);


// DELETE ACCOUNT
router.delete("/me", auth, deleteAccount);

export default router;
