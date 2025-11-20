import { Router } from "express";
import { INTEREST_CATEGORIES } from "../data/categories";

export const router = Router();

router.get("/", (_req, res) => {
  res.json({ categories: INTEREST_CATEGORIES });
});


