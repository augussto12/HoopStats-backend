import { Router } from "express";
import { auth } from "../middlewares/auth";
import { getFavorites, addFavorite, removeFavorite } from "../controllers/favoritesController";

const router = Router();

router.get("/", auth, getFavorites);
router.post("/", auth, addFavorite);
router.delete("/:type/:id", auth, removeFavorite);

export default router;
