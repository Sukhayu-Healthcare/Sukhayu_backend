
import express, { type Request, type Response } from "express";
import { getPgClinent } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken } from "../utils/middleware.js";

export const doctor = express.Router();

/**
 * @route POST /doctor/login
 * @desc  Doctor login using phone and password
 * @body  { doc_phone, password }
 */
doctor.post("/login", async (req: Request, res: Response) => {
  try {
    const { doc_phone, password } = req.body;

    if (!doc_phone || !password) {
      return res.status(400).json({ message: "Please send phone and password both" });
    }

    const pg = getPgClinent();
    // We search by phone which is UNIQUE in schema
    const result = await pg.query(
      `SELECT * FROM doctors WHERE doc_phone = $1`,
      [doc_phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    const doctorRow = result.rows[0];

    const passwordMatches = await argon2.verify(doctorRow.doc_password, password)
      .catch((e) => {
        console.error("argon2 verify error:", e);
        return false;
      });

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // create token (using doc_id as identifier)
    const token = getToken(String(doctorRow.doc_id));

    return res.status(200).json({
      doc_id: doctorRow.doc_id,
      doc_name: doctorRow.doc_name,
      doc_phone: doctorRow.doc_phone,
      token,
    });
  } catch (error) {
    console.error("Error in /doctor/login:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

