"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const categories_1 = require("../data/categories");
exports.router = (0, express_1.Router)();
exports.router.get("/", (_req, res) => {
    res.json({ categories: categories_1.INTEREST_CATEGORIES });
});
