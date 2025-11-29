import express, { type Request, type Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const patient = express.Router();
/**
 * Universal Login
 * POST /login
 * body: { phone, password }
 */
patient.post("/v2/login", async (req: Request, res: Response) => {
  try {
    console.log("universal login");
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        message: "Phone and password are required",
      });
    }

    const pg = getPgClient();

    // Fetch all users with same phone
    const result = await pg.query(
      `SELECT * FROM users WHERE phone = $1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const allUsers = result.rows;

    // Match password
    let matchedUser: any = null;
    for (const u of allUsers) {
      const match = await argon2
        .verify(u.user_password, password)
        .catch(() => false);
      if (match) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create JWT → always store user_id in token
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

      let familyProfiles: any[] = [];

      // Case 1: Main patient (or first member)
      if (
        patientRow.supreme_id === patientRow.patient_id ||
        patientRow.supreme_id === null
      ) {
        const familyQuery = await pg.query(
          `SELECT patient_id, gender, dob, phone, profile_pic
           FROM patient
           WHERE supreme_id = $1`,
          [patientRow.patient_id]
        );

        familyProfiles = familyQuery.rows;
      }
      // Case 2: Family member
      else {
        const familyQuery = await pg.query(
          `SELECT patient_id, gender, dob, phone, profile_pic
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
          name: matchedUser.user_name, // uses USERS table
          phone: matchedUser.phone,
          supreme_id: patientRow.supreme_id,
        },

        familyProfiles,
      });
    }

    // =========================================
    //     ASHA / SUPERVISOR LOGIN
    // =========================================
    return res.status(200).json({
      message: "Login successful",
      token,
      role: matchedUser.user_role,
      user: {
        id: matchedUser.user_id,
        name: matchedUser.user_name,
        phone: matchedUser.phone,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * Patient login (legacy)
 * POST /patient/login
 * body: { phone, password }
 *
 * 🔄 UPDATED to use new schema:
 * - credentials from USERS (role = PATIENT)
 * - patient row from PATIENT via user_id
 */
patient.post("/login", async (req: Request, res: Response) => {
  try {
    console.log("patient");
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        message: "Please send phone and password both",
      });
    }

    const pg = getPgClient();

    // NEW: get user from USERS instead of old patient_* fields // CHANGED
    const userRes = await pg.query(
      `SELECT * FROM users WHERE phone = $1 AND user_role = 'PATIENT'`, // CHANGED
      [phone]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "Patient user not found" }); // CHANGED
    }

    const userRow = userRes.rows[0]; // CHANGED

    // Verify password from USERS table // CHANGED
    const matches = await argon2
      .verify(userRow.user_password, password)
      .catch((err) => {
        console.error("argon2 verify error:", err);
        return false;
      });

    if (!matches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Get patient row linked to this user_id // CHANGED
    const patientRes = await pg.query(
      `SELECT * FROM patient WHERE user_id = $1`, // CHANGED
      [userRow.user_id]
    );

    if (patientRes.rows.length === 0) {
      return res.status(404).json({ message: "Patient not found" }); // CHANGED
    }

    const patientRow = patientRes.rows[0]; // CHANGED

    // JWT now based on user_id (consistent) // CHANGED
    const token = getToken(String(userRow.user_id)); // CHANGED

    // ===============================
    // FEATURE: Get all family profiles (using new column names)
    // ===============================

    let familyProfiles: any[] = [];

    // If user is a SUPER USER (supreme or null)
    if (
      patientRow.supreme_id === patientRow.patient_id ||
      patientRow.supreme_id === null
    ) {
      const familyQuery = await pg.query(
        `SELECT patient_id, gender, dob, phone, profile_pic
         FROM patient 
         WHERE supreme_id = $1`,
        [patientRow.patient_id]
      );

      familyProfiles = familyQuery.rows;
    } else {
      const familyQuery = await pg.query(
        `SELECT patient_id, gender, dob, phone, profile_pic
         FROM patient
         WHERE supreme_id = $1`,
        [patientRow.supreme_id]
      );

      familyProfiles = familyQuery.rows;
    }

    return res.status(200).json({
      message: "Login successful",
      token,
      patient: {
        id: patientRow.patient_id,
        name: userRow.user_name, // CHANGED (name comes from USERS)
        phone: userRow.phone, // CHANGED
        supreme_id: patientRow.supreme_id, // CHANGED
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
 * Needs Authorization header with Bearer token (user_id)
 */
patient.get("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();

    const userId = (req as any).user; // from token (USER ID)
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Invalid token payload: userId missing" });
    }

    // Get patient record using user_id (schema ✅)
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
    let ashaWorker: any = null;

    if (patient.registered_asha_id) {
      // NEW: join with USERS table to get asha_name/phone, and use correct column names // CHANGED
      const ashaRes = await pg.query(
        `SELECT 
           a.asha_id,
           u.user_name AS asha_name,
           u.phone     AS asha_phone,
           a.village   AS asha_village,
           a.taluka    AS asha_taluka,
           a.district  AS asha_district,
           a.profile_pic AS asha_profile_pic
         FROM asha_workers a
         JOIN users u ON a.user_id = u.user_id
         WHERE a.asha_id = $1`,
        [patient.registered_asha_id]
      ); // CHANGED

      ashaWorker = ashaRes.rows[0] || null; // CHANGED
    }

    // =====================
    // Fetch Family Profiles
    // =====================
    let familyProfiles: any[] = [];

    // Case 1 → This patient is SUPER USER (self supreme OR supreme_id null)
    if (
      patient.supreme_id === patient.patient_id ||
      patient.supreme_id === null
    ) {
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
 * Protected — returns past consultations and attached prescription items
 *
 * 🔄 UPDATED: token has user_id, we map to patient_id via patient.user_id
 */
patient.get(
  "/consultations",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const pg = getPgClient();
      const userId = (req as any).user; // CHANGED
      if (!userId) {
        return res.status(401).json({ message: "Invalid token payload" });
      }

      // NEW: get patient_id for this user_id // CHANGED
      const patRes = await pg.query(
        `SELECT patient_id FROM patient WHERE user_id = $1`,
        [userId]
      ); // CHANGED

      if (patRes.rows.length === 0) {
        return res.status(404).json({ message: "Patient not found" }); // CHANGED
      }

      const patientId = patRes.rows[0].patient_id; // CHANGED

      // 1) fetch consultations for patient (with doctor info)
      const consultRes = await pg.query(
        `SELECT c.consultation_id, c.doctor_id, d.doc_name AS doctor_name, d.doc_phone AS doctor_phone,
                c.diagnosis, c.notes, c.consultation_date
         FROM consultations c
         LEFT JOIN doctors d ON c.doctor_id = d.doc_id
         WHERE c.patient_id = $1
         ORDER BY c.consultation_date DESC`,
        [patientId] // CHANGED
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
  }
);

/**
 * GET /patient/consultation-summary
 * Protected — summary list (one row per consultation)
 *
 * 🔄 UPDATED: map user_id → patient_id
 */
patient.get(
  "/consultation-summary",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const pg = getPgClient();
      const userId = (req as any).user; // CHANGED
      if (!userId)
        return res.status(401).json({ message: "Invalid token payload" });

      // NEW: map user_id → patient_id // CHANGED
      const patRes = await pg.query(
        `SELECT patient_id FROM patient WHERE user_id = $1`,
        [userId]
      ); // CHANGED

      if (patRes.rows.length === 0) {
        return res.status(404).json({ message: "Patient not found" }); // CHANGED
      }

      const patientId = patRes.rows[0].patient_id; // CHANGED

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
      const { rows } = await pg.query(q, [patientId]); // CHANGED

      const formatDate = (d: any) => {
        if (!d) return null;
        const dt = new Date(d);
        try {
          return dt.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
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
  }
);

/**
 * GET /patient/consultation/:id
 * Protected — full consultation + prescription items
 *
 * 🔄 UPDATED: token → user_id → patient_id
 */
patient.get(
  "/consultation/:id",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const pg = getPgClient();
      const userId = (req as any).user; // CHANGED
      const consultationId = Number(req.params.id);
      if (!userId)
        return res.status(401).json({ message: "Invalid token payload" });
      if (!Number.isInteger(consultationId) || consultationId <= 0)
        return res.status(400).json({ message: "Invalid consultation id" });

      // NEW: map user_id → patient_id // CHANGED
      const patRes = await pg.query(
        `SELECT patient_id FROM patient WHERE user_id = $1`,
        [userId]
      ); // CHANGED

      if (patRes.rows.length === 0) {
        return res.status(404).json({ message: "Patient not found" }); // CHANGED
      }

      const patientId = patRes.rows[0].patient_id; // CHANGED

      const consultQ = `
        SELECT c.consultation_id, c.doctor_id, d.doc_name AS doctor_name, d.doc_phone AS doctor_phone,
               c.diagnosis, c.notes, c.consultation_date, c.patient_id
        FROM consultations c
        LEFT JOIN doctors d ON c.doctor_id = d.doc_id
        WHERE c.consultation_id = $1
      `;
      const consultRes = await pg.query(consultQ, [consultationId]);
      if (consultRes.rows.length === 0)
        return res.status(404).json({ message: "Consultation not found" });

      const consult = consultRes.rows[0];

      // ensure consultation belongs to this patient (using resolved patientId) // CHANGED
      if (Number(consult.patient_id) !== Number(patientId))
        return res.status(403).json({ message: "Access denied" }); // CHANGED

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
        items: itemsRes.rows,
      };

      return res.status(200).json({ consultation: result });
    } catch (err) {
      console.error("Error in GET /patient/consultation/:id:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

patient.get("/search",verifyToken , async (req: Request, res: Response) => {
  try {
    const asha_id = (req as any).user;
    const { name , phone} = req.query;
    const pg = getPgClient();

    if (name) {
      const patientRes = await pg.query(
        `SELECT patient_id, gender, dob, phone, profile_pic, village, taluka, district
         FROM patient
         WHERE user_id IN (
           SELECT user_id FROM users WHERE user_name ILIKE $1
         )
         AND registered_asha_id = $2`,
        [`%${name}%`, asha_id]
      );
     if (patientRes.rows.length === 0) {
       return res.status(404).json({ message: "No patients found" });
     }
      const rows = patientRes.rows;
      return res.status(200).json({ message : "sucessfully found", patients: rows });
    }else if(phone){
      const patientRes = await pg.query(`SELECT patient_id, gender, dob, phone, profile_pic, village, taluka, district
         FROM patient
         WHERE user_id IN (
           SELECT user_id FROM users WHERE phone ILIKE $1
         )
         AND registered_asha_id = $2`, [phone, asha_id]);

      if (patientRes.rows.length === 0) {
        return res.status(404).json({ message: "No patients found" });
      }
       const rows = patientRes.rows;
       return res.status(200).json({ message : "sucessfully found", patients: rows });
    }else {
      return res.status(400).json({ message: "Please provide name or phone to search" });
    }
  } catch (e) {
    console.error("Search Error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

patient.get("/all", verifyToken, async (req: Request, res: Response) => {
  try {
    const asha_id = (req as any).user;
    const pg = getPgClient();

    const patientRes = await pg.query(`
      SELECT 
        p.patient_id,
        p.gender,
        p.dob,
        p.phone,
        p.profile_pic,
        p.village,
        p.taluka,
        p.district,
        p.supreme_id,
        u.user_name AS name,
        u.phone AS user_phone
      FROM patient p
      LEFT JOIN users u ON p.user_id = u.user_id
      WHERE p.registered_asha_id = $1
      ORDER BY u.user_name ASC;
    `, [asha_id]);

    if (patientRes.rows.length === 0) {
      return res.status(404).json({ message: "No patients found" });
    }

    return res.status(200).json({
      message: "found all",
      patients: patientRes.rows
    });
  } catch (err) {
    console.error("Fetch Patient Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
