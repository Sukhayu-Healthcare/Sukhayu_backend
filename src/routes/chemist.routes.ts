import express, { type Request, type Response } from "express";
import { getPgClinent } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken } from "../utils/middleware.js";

export const chemist = express.Router();

/**
 * @route POST /chemist/login
 * @desc Login route for chemist
 * @access Public
 */
chemist.post("/login", async (req: Request, res: Response) => {
  try {
    const { chemistId, password } = req.body;

    // 1️⃣ Validation
    if (!chemistId || !password) {
      return res.status(400).json({
        message: "Please send ID and Password both",
      });
    }

    // 2️⃣ Connect to PostgreSQL
    const pg = getPgClinent();

    // 3️⃣ Fetch chemist record
    const result = await pg.query(
      `SELECT * FROM chemists WHERE chemist_ID = $1`,
      [chemistId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Chemist not found",
      });
    }

    const chemistData = result.rows[0];

    // 4️⃣ Verify password using Argon2
    const isPasswordValid = await argon2.verify(
      chemistData.chemist_password,
      password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // 5️⃣ Generate JWT Token
    const token = getToken(chemistId);

    // 6️⃣ Respond with token and details
    return res.status(200).json({
      chemistId,
      name: chemistData.chemist_name,
      token,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Error in /chemist/login:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});
