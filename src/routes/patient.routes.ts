import express, { type Request, type Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const patient = express.Router();

/**
 * helper: resolve user id from token payload set by verifyToken
 */
function resolveUserIdFromReq(req: Request): number | null {
  const u = (req as any).user;
  if (!u) return null;
  if (typeof u === "string" || typeof u === "number") return Number(u);
  if (typeof u === "object" && (u.userId || u.user_id)) {
    return Number(u.userId ?? u.user_id);
  }
  return null;
}

/* =========================================================================
   POST /patient/v2/login
   Universal login (users table). Returns token and role-specific data.
   Body: { phone, password }
   ========================================================================= */
patient.post("/v2/login", async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Phone and password are required" });
    }

    const pg = getPgClient();

    // fetch all users with this phone (could be multiple roles)
    const usersQ = await pg.query(`SELECT * FROM users WHERE phone = $1`, [phone]);

    if (usersQ.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // find a user whose password matches
    let matchedUser: any | null = null;
    for (const u of usersQ.rows) {
      const ok = await argon2.verify(u.user_password, password).catch(() => false);
      if (ok) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = getToken(String(matchedUser.user_id));

    // If patient role, return patient-specific payload
    if (matchedUser.user_role === "PATIENT") {
      const patQ = await pg.query(`SELECT * FROM patient WHERE user_id = $1`, [matchedUser.user_id]);
      if (patQ.rows.length === 0) {
        return res.status(404).json({ message: "Patient record not found" });
      }

      const patientRow = patQ.rows[0];

      // Build family profiles (members sharing same supreme_id)
      let familyProfiles: any[] = [];
      const supremeId = patientRow.supreme_id ?? patientRow.patient_id;
      const famQ = await pg.query(
        `SELECT patient_id, gender, dob, phone, profile_pic, village, taluka, district, supreme_id
         FROM patient WHERE supreme_id = $1`,
        [supremeId]
      );
      familyProfiles = famQ.rows;

      return res.status(200).json({
        message: "Login successful",
        token,
        role: "PATIENT",
        patient: {
          patient_id: patientRow.patient_id,
          user_id: matchedUser.user_id,
          name: matchedUser.user_name,
          phone: matchedUser.phone,
          supreme_id: patientRow.supreme_id,
          registered_asha_id: patientRow.registered_asha_id ?? null,
        },
        familyProfiles,
      });
    }

    // For ASHA / Supervisor / other roles, return generic user payload
    return res.status(200).json({
      message: "Login successful",
      token,
      role: matchedUser.user_role,
      user: {
        user_id: matchedUser.user_id,
        name: matchedUser.user_name,
        phone: matchedUser.phone,
      },
    });
  } catch (err) {
    console.error("v2/login error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* =========================================================================
   GET /patient/profile
   Protected. Use token -> user_id -> patient row
   ========================================================================= */
patient.get("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = resolveUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: "Invalid token payload" });

    const pg = getPgClient();

    const patQ = await pg.query(
      `SELECT patient_id, user_id, supreme_id, gender, dob, phone, profile_pic,
              village, taluka, district, registered_asha_id, created_at
       FROM patient WHERE user_id = $1`,
      [userId]
    );

    if (patQ.rows.length === 0) {
      return res.status(404).json({ message: "Patient profile not found" });
    }

    const patient = patQ.rows[0];

    // Fetch assigned ASHA (if any) and include ASHA name & phone from users
    let ashaWorker: any = null;
    if (patient.registered_asha_id) {
      const ashaQ = await pg.query(
        `SELECT a.asha_id, a.village, a.taluka, a.district, a.profile_pic,
                u.user_id, u.user_name AS asha_name, u.phone AS asha_phone
         FROM asha_workers a
         LEFT JOIN users u ON a.user_id = u.user_id
         WHERE a.asha_id = $1`,
        [patient.registered_asha_id]
      );
      if (ashaQ.rows.length) ashaWorker = ashaQ.rows[0];
    }

    // Family profiles (all members under same supreme_id)
    const supremeId = patient.supreme_id ?? patient.patient_id;
    const famQ = await pg.query(
      `SELECT patient_id, gender, dob, phone, profile_pic, village, taluka, district
       FROM patient WHERE supreme_id = $1`,
      [supremeId]
    );

    return res.status(200).json({
      message: "Profile fetched successfully",
      patient,
      familyProfiles: famQ.rows,
      ashaWorker,
    });
  } catch (err) {
    console.error("GET /patient/profile error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* =========================================================================
   GET /patient/consultations
   Protected. Returns patient's consultations with prescription items attached.
   Mapping: token -> user_id -> patient_id
   ========================================================================= */
patient.get("/consultations", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = resolveUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: "Invalid token payload" });

    const pg = getPgClient();

    // map user_id -> patient_id
    const patQ = await pg.query(`SELECT patient_id FROM patient WHERE user_id = $1`, [userId]);
    if (patQ.rows.length === 0) return res.status(404).json({ message: "Patient not found" });
    const patientId = patQ.rows[0].patient_id;

    // fetch consultations
    const consultQ = await pg.query(
      `SELECT c.consultation_id, c.patient_id, c.doctor_id, c.diagnosis, c.notes, c.consultation_date,
              d.doc_name AS doctor_name, d.doc_phone AS doctor_phone
       FROM consultations c
       LEFT JOIN doctors d ON c.doctor_id = d.doc_id
       WHERE c.patient_id = $1
       ORDER BY c.consultation_date DESC`,
      [patientId]
    );

    const consultations = consultQ.rows;

    if (consultations.length === 0) return res.status(200).json({ consultations: [] });

    // fetch prescription items for all consultations
    const ids = consultations.map((c: any) => c.consultation_id);
    const itemsQ = await pg.query(
      `SELECT consultation_id, item_id, medicine_name, dosage, frequency, duration, instructions
       FROM prescription_items
       WHERE consultation_id = ANY($1::int[])
       ORDER BY item_id ASC`,
      [ids]
    );

    // group items by consultation_id
    const itemsByConsult: Record<number, any[]> = {};
    for (const it of itemsQ.rows) {
      const k = Number(it.consultation_id);
      if (!itemsByConsult[k]) itemsByConsult[k] = [];
      itemsByConsult[k].push(it);
    }

    const withItems = consultations.map((c: any) => ({
      ...c,
      items: itemsByConsult[c.consultation_id] ?? [],
    }));

    return res.status(200).json({ consultations: withItems });
  } catch (err) {
    console.error("GET /patient/consultations error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* =========================================================================
   GET /patient/consultation-summary
   Protected. One-line summary per consultation.
   ========================================================================= */
patient.get("/consultation-summary", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = resolveUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: "Invalid token payload" });

    const pg = getPgClient();

    const patQ = await pg.query(`SELECT patient_id FROM patient WHERE user_id = $1`, [userId]);
    if (patQ.rows.length === 0) return res.status(404).json({ message: "Patient not found" });
    const patientId = patQ.rows[0].patient_id;

    const q = `
      SELECT c.consultation_id, c.consultation_date, d.doc_name AS doctor_name, d.doc_id AS doctor_id
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
    console.error("GET /patient/consultation-summary error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* =========================================================================
   GET /patient/consultation/:id
   Protected. Return one consultation with items. Ensure ownership.
   ========================================================================= */
patient.get("/consultation/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = resolveUserIdFromReq(req);
    if (!userId) return res.status(401).json({ message: "Invalid token payload" });

    const consultationId = Number(req.params.id);
    if (!Number.isInteger(consultationId) || consultationId <= 0) {
      return res.status(400).json({ message: "Invalid consultation id" });
    }

    const pg = getPgClient();

    const patQ = await pg.query(`SELECT patient_id FROM patient WHERE user_id = $1`, [userId]);
    if (patQ.rows.length === 0) return res.status(404).json({ message: "Patient not found" });
    const patientId = patQ.rows[0].patient_id;

    // fetch consultation
    const consultQ = await pg.query(
      `SELECT c.consultation_id, c.patient_id, c.doctor_id, c.diagnosis, c.notes, c.consultation_date,
              d.doc_name AS doctor_name, d.doc_phone AS doctor_phone
       FROM consultations c
       LEFT JOIN doctors d ON c.doctor_id = d.doc_id
       WHERE c.consultation_id = $1`,
      [consultationId]
    );

    if (consultQ.rows.length === 0) return res.status(404).json({ message: "Consultation not found" });

    const consult = consultQ.rows[0];

    // verify ownership
    if (Number(consult.patient_id) !== Number(patientId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // fetch items
    const itemsQ = await pg.query(
      `SELECT item_id, medicine_name, dosage, frequency, duration, instructions
       FROM prescription_items
       WHERE consultation_id = $1
       ORDER BY item_id ASC`,
      [consultationId]
    );

    const result = {
      consultation_id: consult.consultation_id,
      consultation_date: consult.consultation_date,
      doctor_id: consult.doctor_id,
      doctor_name: consult.doctor_name,
      doctor_phone: consult.doctor_phone,
      diagnosis: consult.diagnosis,
      notes: consult.notes,
      items: itemsQ.rows,
    };

    return res.status(200).json({ consultation: result });
  } catch (err) {
    console.error("GET /patient/consultation/:id error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* =========================================================================
   GET /patient/search
   Protected — ASHA calls this to search patients they registered.
   Query params: ?name=... OR ?phone=...
   ========================================================================= */
patient.get("/search", verifyToken, async (req: Request, res: Response) => {
  try {
    const ashaUserId = resolveUserIdFromReq(req);
    if (!ashaUserId) return res.status(401).json({ message: "Invalid token payload" });

    const { name, phone } = req.query;
    if (!name && !phone) return res.status(400).json({ message: "Provide name or phone to search" });

    const pg = getPgClient();

    // Find asha_id from asha_workers where user_id = ashaUserId
    const ashaQ = await pg.query(`SELECT asha_id FROM asha_workers WHERE user_id = $1`, [ashaUserId]);
    if (ashaQ.rows.length === 0) return res.status(403).json({ message: "Not an ASHA or no ASHA record found" });
    const ashaId = ashaQ.rows[0].asha_id;

    let patientsRes;
    if (name) {
      const q = `
        SELECT p.patient_id, p.gender, p.dob, p.phone, p.profile_pic, p.village, p.taluka, p.district,
               u.user_name AS name
        FROM patient p
        LEFT JOIN users u ON p.user_id = u.user_id
        WHERE u.user_name ILIKE $1 AND p.registered_asha_id = $2
        ORDER BY u.user_name ASC
        LIMIT 50
      `;
      patientsRes = await pg.query(q, [`%${String(name)}%`, ashaId]);
    } else {
      const q = `
        SELECT p.patient_id, p.gender, p.dob, p.phone, p.profile_pic, p.village, p.taluka, p.district,
               u.user_name AS name
        FROM patient p
        LEFT JOIN users u ON p.user_id = u.user_id
        WHERE u.phone ILIKE $1 AND p.registered_asha_id = $2
        LIMIT 50
      `;
      patientsRes = await pg.query(q, [`%${String(phone)}%`, ashaId]);
    }

    if (patientsRes.rows.length === 0) return res.status(404).json({ message: "No patients found" });

    return res.status(200).json({ patients: patientsRes.rows });
  } catch (err) {
    console.error("GET /patient/search error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* =========================================================================
   GET /patient/all
   Protected — returns all patients registered to the ASHA (from token user)
   ========================================================================= */
patient.get("/all", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user;
    console.log(1)
    if (!userId) return res.status(401).json({ message: "Invalid token payload" });

    const pg = getPgClient();

    // find asha_id for this user
    const ashaQ = await pg.query(`SELECT asha_id FROM asha_workers WHERE user_id = $1`, [userId]);
    if (ashaQ.rows.length === 0) return res.status(403).json({ message: "Not an ASHA or no ASHA record found" });
    const ashaId = ashaQ.rows[0].asha_id;

    const patientRes = await pg.query(
      `SELECT p.patient_id, p.gender, p.dob, p.phone, p.profile_pic, p.village, p.taluka, p.district, p.supreme_id,
              u.user_name AS name, u.phone AS user_phone
       FROM patient p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.registered_asha_id = $1
       ORDER BY u.user_name ASC`,
      [ashaId]
    );

    if (patientRes.rows.length === 0) return res.status(404).json({ message: "No patients found" });

    return res.status(200).json({ patients: patientRes.rows });
  } catch (err) {
    console.error("GET /patient/all error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
