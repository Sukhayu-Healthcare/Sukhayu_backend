import express, { type Request, type Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const patient = express.Router();


const router = express.Router();

/**
 * Universal Login
 * POST /login
 * body: { phone, password }
 */
patient.post("/v2/login", async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        message: "Phone and password are required",
      });
    }

    const pg = getPgClient();

    // Fetch ALL users with same phone (patient, asha, supervisor)
    const result = await pg.query(
      `SELECT * FROM users WHERE phone = $1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const allUsers = result.rows;

    // Try password against every user, find the correct one
    let matchedUser = null;

    for (const u of allUsers) {
      const match = await argon2.verify(u.user_password, password).catch(() => false);

      if (match) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Sign token
    const token = getToken(String(matchedUser.user_id));

    // =========================================
    //          PATIENT ROLE LOGIN
    // =========================================
    if (matchedUser.user_role === "PATIENT") {
      const patientRes = await pg.query(
        `SELECT * FROM patient WHERE user_id = $1`,
        [matchedUser.user_id]
      );

      if (patientRes.rows.length === 0) {
        return res.status(404).json({ message: "Patient record not found" });
      }

      const patientRow = patientRes.rows[0];

      let familyProfiles = [];

      // Case 1: Super-user (self supreme)
      if (patientRow.supreme_id === patientRow.patient_id || patientRow.supreme_id === null) {
        
        const familyQuery = await pg.query(
          `SELECT patient_id, patient_name, patient_gender, patient_dob,
                  phone, profile_pic
           FROM patient
           WHERE supreme_id = $1`,
          [patientRow.patient_id]
        );

        familyProfiles = familyQuery.rows;
      }

      // Case 2: Family member → Return all members under its supreme
      else {
        const familyQuery = await pg.query(
          `SELECT patient_id, patient_name, patient_gender, patient_dob,
                  phone, profile_pic
           FROM patient
           WHERE supreme_id = $1`,
          [patientRow.supreme_id]
        );

        familyProfiles = familyQuery.rows;
      }

      return res.status(200).json({
        message: "Login successful",
        token,
        role: matchedUser.user_role,
        patient: {
          id: patientRow.patient_id,
          name: patientRow.patient_name,
          phone: patientRow.phone,
          supreme_id: patientRow.supreme_id,
        },
        familyProfiles,
      });
    }

    // =========================================
    //     NON-PATIENT (ASHA / SUPERVISOR)
    // =========================================
    return res.status(200).json({
      message: "Login successful",
      token,
      role: matchedUser.user_role,
      user: {
        id: matchedUser.user_id,
        name: matchedUser.user_name,
        phone: matchedUser.phone,
      }
    });

  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


/**
 * Patient login
 * POST /patient/login
 * body: { patient_phone, password }
 */
patient.post("/login", async (req: Request, res: Response) => {
  try {
    console.log("patient")
    const { phone, password } = req.body;

    if (!phone || !password) {
      console.log("1")
      return res.status(400).json({
        message: "Please send phone and password both",
      });
    }

    const pg = getPgClient();
    const result = await pg.query(
      `SELECT * FROM patient WHERE patient_phone = $1`,
      [phone]
    );
    console.log("2")
    if (result.rows.length === 0) {
      console.log("3")
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
      console.log("4")
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // JWT for main user
    const token = getToken(String(patientRow.patient_id));

    // ===============================
    // FEATURE: Get all family profiles
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
    console.log("6")
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
    const pg = getPgClient();

    const userId = (req as any).user; // from token
    if (!userId) {
      return res.status(401).json({ message: "Invalid token payload: userId missing" });
    }

    // Get patient record using user_id
    const patientRes = await pg.query(
      `SELECT patient_id, gender, dob, phone, supreme_id,
              profile_pic, village, taluka, district, history, 
              created_at, registered_asha_id, user_id
       FROM patient 
       WHERE user_id = $1`,
      [userId]
    );

    if (patientRes.rows.length === 0) {
      return res.status(404).json({ message: "Patient profile not found" });
    }

    const patient = patientRes.rows[0];

    // =====================
    // Fetch ASHA worker (optional)
    // =====================
    let ashaWorker = null;

    if (patient.registered_asha_id) {
      const ashaRes = await pg.query(
        `SELECT asha_id, asha_name, asha_phone, asha_village, asha_taluka, asha_dist
         FROM asha_workers
         WHERE asha_id = $1`,
        [patient.registered_asha_id]
      );
      ashaWorker = ashaRes.rows[0] || null;
    }

    // =====================
    // Fetch Family Profiles
    // =====================
    let familyProfiles = [];

    // Case 1 → This patient is SUPER USER (self supreme OR supreme_id null)
    if (patient.supreme_id === patient.patient_id || patient.supreme_id === null) {
      
      const famRes = await pg.query(
        `SELECT patient_id, gender, dob, phone,
                profile_pic, village, taluka, district
         FROM patient
         WHERE supreme_id = $1`,
        [patient.patient_id]
      );

      familyProfiles = famRes.rows;
    }

    // Case 2 → Family Member (return all members under supreme)
    else {
      const famRes = await pg.query(
        `SELECT patient_id, gender, dob, phone,
                profile_pic, village, taluka, district
         FROM patient
         WHERE supreme_id = $1`,
        [patient.supreme_id]
      );

      familyProfiles = famRes.rows;
    }

    // ================================
    // Final Response
    // ================================
    return res.status(200).json({
      message: "Profile fetched successfully",
      patient,
      familyProfiles,
      ashaWorker,
    });

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
    const pg = getPgClient();
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


/**
 * GET /patient/consultation-summary
 * Protected — lightweight list for UI (one-line per consultation)
 * Each item: { consultation_id, consultation_date, consultation_date_readable, doctor_name, doctor_id }
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
      try {
        return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      } catch {
        return dt.toISOString().slice(0, 10);
      }
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
 * Protected — returns full consultation + prescription items for the given consultation_id
 */
patient.get("/consultation/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const patientId = (req as any).user;
    const consultationId = Number(req.params.id);
    if (!patientId) return res.status(401).json({ message: "Invalid token payload" });
    if (!Number.isInteger(consultationId) || consultationId <= 0)
      return res.status(400).json({ message: "Invalid consultation id" });

    const consultQ = `
      SELECT c.consultation_id, c.doctor_id, d.doc_name AS doctor_name, d.doc_phone AS doctor_phone,
             c.diagnosis, c.notes, c.consultation_date, c.patient_id
      FROM consultations c
      LEFT JOIN doctors d ON c.doctor_id = d.doc_id
      WHERE c.consultation_id = $1
    `;
    const consultRes = await pg.query(consultQ, [consultationId]);
    if (consultRes.rows.length === 0) return res.status(404).json({ message: "Consultation not found" });

    const consult = consultRes.rows[0];
    if (Number(consult.patient_id) !== Number(patientId)) return res.status(403).json({ message: "Access denied" });

    const itemsQ = `
      SELECT item_id, medicine_name, dosage, frequency, duration, instructions
      FROM prescription_items
      WHERE consultation_id = $1
      ORDER BY item_id ASC
    `;
    const itemsRes = await pg.query(itemsQ, [consultationId]);

    const result = {
      consultation_id: consult.consultation_id,
      consultation_date: consult.consultation_date,
      doctor_id: consult.doctor_id,
      doctor_name: consult.doctor_name,
      doctor_phone: consult.doctor_phone,
      diagnosis: consult.diagnosis,
      notes: consult.notes,
      items: itemsRes.rows
    };

    return res.status(200).json({ consultation: result });
  } catch (err) {
    console.error("Error in GET /patient/consultation/:id:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
