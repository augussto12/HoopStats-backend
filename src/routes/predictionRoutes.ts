import { Router } from "express";
import { auth } from "../middlewares/auth";

import {
    createPrediction,
    getMyPredictions,
    getAllPredictions,
    updateRealPoints,
    deletePrediction
} from "../controllers/prediccionesController";

const router = Router();

// Rutas del usuario
router.post("/create", auth, createPrediction);
router.get("/my", auth, getMyPredictions);
router.delete("/:id", auth, deletePrediction);

// Admin o CRON
router.get("/all", getAllPredictions);
router.patch("/update/:id", updateRealPoints);

export default router;
