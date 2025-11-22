import express, { type Request, type Response } from "express";
import { getPgClinent } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const patient = express.Router();

/**
 * Patient login
 * POST /patient/login
 * body: { patient_phone, password }
 */
patient.post("/login", async (req: Request, res: Response) => {
  try {
    const { patient_phone, password } = req.body;
    if (!patient_phone || !password) {
      return res
        .status(400)
        .json({ message: "Please send phone and password both" });
    }

    const pg = getPgClinent();
    const result = await pg.query(
      `SELECT * FROM patient WHERE patient_phone = $1`,
      [patient_phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const patientRow = result.rows[0];

    // verify hashed password (stored in patient_password)
    const matches = await argon2.verify(patientRow.patient_password, password)
      .catch((e) => {
        console.error("argon2 verify error:", e);
        return false;
      });

    if (!matches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create token for patient
    const token = getToken(String(patientRow.patient_id));

    return res.status(200).json({
      patient_id: patientRow.patient_id,
      patient_name: patientRow.patient_name,
      patient_phone: patientRow.patient_phone,
      token,
    });
  } catch (error) {
    console.error("Error in /patient/login:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * Patient profile (protected)
 * GET /patient/profile
 * Needs Authorization header with Bearer token
 */
patient.get("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClinent();

    // middleware attaches the id string to req.user
    const patientId = (req as any).user;
    if (!patientId) {
      return res
        .status(401)
        .json({ message: "Invalid token payload: patientId missing" });
    }

    const result = await pg.query(
      `SELECT patient_id, patient_name, patient_gender, patient_dob, patient_phone, patient_profile_pic, patient_village, patient_taluka, patient_dist, patient_hist, patient_created_at
       FROM patient WHERE patient_id = $1`,
      [patientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Profile not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error in GET /patient/profile:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
