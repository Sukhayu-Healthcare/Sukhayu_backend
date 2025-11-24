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
      return res.status(400).json({
        message: "Please send phone and password both",
      });
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

    // Verify password
    const matches = await argon2.verify(patientRow.patient_password, password)
      .catch((err) => {
        console.error("argon2 verify error:", err);
        return false;
      });

    if (!matches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // JWT for main user
    const token = getToken(String(patientRow.patient_id));

    // ===============================
    // 🚀 FEATURE: Get all family profiles
    // ===============================

    let familyProfiles = [];

    // If user is a SUPER USER (supreme)
    if (patientRow.patient_supreme_id === null) {
      const familyQuery = await pg.query(
        `SELECT patient_id, patient_name, patient_gender, patient_dob, 
                patient_phone, patient_profile_pic
         FROM patient 
         WHERE patient_supreme_id = $1`,
        [patientRow.patient_id]
      );

      familyProfiles = familyQuery.rows;
    }

    // If user is NOT super user, but they are a family member
    // Get their super user's family list too
    else {
      const familyQuery = await pg.query(
        `SELECT patient_id, patient_name, patient_gender, patient_dob,
                patient_phone, patient_profile_pic
         FROM patient
         WHERE patient_supreme_id = $1`,
        [patientRow.patient_supreme_id]
      );

      familyProfiles = familyQuery.rows;
    }

    return res.status(200).json({
      message: "Login successful",
      token,
      patient: {
        id: patientRow.patient_id,
        name: patientRow.patient_name,
        phone: patientRow.patient_phone,
        supreme_id: patientRow.patient_supreme_id,
      },
      familyProfiles,
    });

  } catch (err) {
    console.error("Login Error:", err);
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

/**
 * GET /patient/consultations
 * Protected — returns past consultations and attached prescription items for the authenticated patient
 * Response: { consultations: [ { consultation_id, doctor_id, doctor_name, doctor_phone, diagnosis, notes, consultation_date, items: [ ... ] }, ... ] }
 */
patient.get("/consultations", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClinent();
    const patientId = (req as any).user;
    if (!patientId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    // 1) fetch consultations for patient (with doctor info)
    const consultRes = await pg.query(
      `SELECT c.consultation_id, c.doctor_id, d.doc_name AS doctor_name, d.doc_phone AS doctor_phone,
              c.diagnosis, c.notes, c.consultation_date
       FROM consultations c
       LEFT JOIN doctors d ON c.doctor_id = d.doc_id
       WHERE c.patient_id = $1
       ORDER BY c.consultation_date DESC`,
      [patientId]
    );

    const consultations = consultRes.rows;

    if (consultations.length === 0) {
      return res.status(200).json({ consultations: [] });
    }

    // 2) fetch all prescription items for these consultations in one query
    const ids = consultations.map((c: any) => c.consultation_id);
    const itemsRes = await pg.query(
      `SELECT consultation_id, item_id, medicine_name, dosage, frequency, duration, instructions
       FROM prescription_items
       WHERE consultation_id = ANY($1::int[])`,
      [ids]
    );

    // 3) group items by consultation_id
    const itemsByConsult: Record<number, any[]> = {};
    for (const item of itemsRes.rows) {
      const key = Number(item.consultation_id);
      if (!itemsByConsult[key]) itemsByConsult[key] = [];
      itemsByConsult[key].push(item);
    }

    // 4) attach items to consultations
    const withItems = consultations.map((c: any) => ({
      ...c,
      items: itemsByConsult[c.consultation_id] ?? [],
    }));

    return res.status(200).json({ consultations: withItems });
  } catch (err) {
    console.error("Error in GET /patient/consultations:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
