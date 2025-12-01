import express, { type Request, type Response } from "express";
import { getPgClient } from "../config/postgress.js";
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
    console.log("patient");
    const { patient_phone, password } = req.body;

    if (!patient_phone || !password) {
      return res.status(400).json({
        message: "Please send phone and password both",
      });
    }

    const pg = getPgClient();

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
    // FEATURE: Get all family profiles
    // ===============================

    let familyProfiles: any[] = [];

    // If user is a SUPER USER
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
    // If user is a FAMILY MEMBER
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
 */
patient.get("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const patientId = (req as any).user;

    if (!patientId) {
      return res
        .status(401)
        .json({ message: "Invalid token payload: patientId missing" });
    }

    const result = await pg.query(
      `SELECT patient_id, patient_name, patient_gender, patient_dob, patient_phone, patient_profile_pic, 
              patient_village, patient_taluka, patient_dist, patient_hist, patient_created_at
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
 */
patient.get("/consultations", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const patientId = (req as any).user;

    if (!patientId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

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

    const ids = consultations.map((c: any) => c.consultation_id);

    const itemsRes = await pg.query(
      `SELECT consultation_id, item_id, medicine_name, dosage, frequency, duration, instructions
       FROM prescription_items
       WHERE consultation_id = ANY($1::int[])`,
      [ids]
    );

    const itemsByConsult: Record<number, any[]> = {};

    for (const item of itemsRes.rows) {
      const key = Number(item.consultation_id);
      if (!itemsByConsult[key]) itemsByConsult[key] = [];
      itemsByConsult[key].push(item);
    }

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

/**
 * GET /patient/consultation-summary
 */
patient.get("/consultation-summary", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const patientId = (req as any).user;

    if (!patientId) return res.status(401).json({ message: "Invalid token payload" });

    const q = `
      SELECT c.consultation_id,
             c.consultation_date,
             d.doc_name AS doctor_name,
             d.doc_id AS doctor_id
      FROM consultations c
      LEFT JOIN doctors d ON c.doctor_id = d.doc_id
      WHERE c.patient_id = $1
      ORDER BY c.consultation_date DESC
    `;

    const { rows } = await pg.query(q, [patientId]);

    const formatDate = (d: any) => {
      if (!d) return null;
      const dt = new Date(d);
      return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    };

    const summary = rows.map((r: any) => ({
      consultation_id: r.consultation_id,
      consultation_date: r.consultation_date,
      consultation_date_readable: formatDate(r.consultation_date),
      doctor_name: r.doctor_name,
      doctor_id: r.doctor_id,
    }));

    return res.status(200).json({ consultations: summary });
  } catch (err) {
    console.error("Error in GET /patient/consultation-summary:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /patient/consultation/:id
 */
patient.get("/consultation/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const patientId = (req as any).user;
    const consultationId = Number(req.params.id);

    if (!patientId) return res.status(401).json({ message: "Invalid token payload" });

    if (!Number.isInteger(consultationId) || consultationId <= 0) {
      return res.status(400).json({ message: "Invalid consultation id" });
    }

    const consultRes = await pg.query(
      `SELECT c.consultation_id, c.doctor_id, d.doc_name AS doctor_name, d.doc_phone AS doctor_phone,
              c.diagnosis, c.notes, c.consultation_date, c.patient_id
       FROM consultations c
       LEFT JOIN doctors d ON c.doctor_id = d.doc_id
       WHERE c.consultation_id = $1`,
      [consultationId]
    );

    if (consultRes.rows.length === 0) {
      return res.status(404).json({ message: "Consultation not found" });
    }

    const consult = consultRes.rows[0];

    if (Number(consult.patient_id) !== Number(patientId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const itemsRes = await pg.query(
      `SELECT item_id, medicine_name, dosage, frequency, duration, instructions
       FROM prescription_items
       WHERE consultation_id = $1
       ORDER BY item_id ASC`,
      [consultationId]
    );

    return res.status(200).json({
      consultation: {
        consultation_id: consult.consultation_id,
        consultation_date: consult.consultation_date,
        doctor_id: consult.doctor_id,
        doctor_name: consult.doctor_name,
        doctor_phone: consult.doctor_phone,
        diagnosis: consult.diagnosis,
        notes: consult.notes,
        items: itemsRes.rows,
      }
    });

  } catch (err) {
    console.error("Error in GET /patient/consultation/:id:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});