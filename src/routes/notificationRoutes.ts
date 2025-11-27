import { Router } from "express";
import { auth } from "../middlewares/auth";
import {
    getMyNotifications,
    markAsRead,
    deleteNotification,
    deleteAllRead
} from "../controllers/notificationController";

const router = Router();

router.get("/", auth, getMyNotifications);
router.patch("/:id/read", auth, markAsRead);
router.delete("/:id", auth, deleteNotification);
router.delete("/clear/read", auth, deleteAllRead);

export default router;
