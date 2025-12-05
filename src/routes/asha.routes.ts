import express, { type Request, type Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";
import { sendFCM } from "./notification/fcm.js";

export const asha = express.Router();

/**
 * Register Supervisor (ASHA head)
 * POST /asha/register-supervisor
 */
asha.post("/register-supervisor", async (req: Request, res: Response) => {
  try {
    const { name, password, phone, village, district, taluka, profilePic } =
      req.body;

    // Validate required fields
    if (!name || !password || !phone || !village || !district || !taluka) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const pg = getPgClient();

    // Check if phone already exists in USERS table
    const existing = await pg.query(
      "SELECT user_id FROM users WHERE phone = $1",
      [phone]
    );

    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json({ message: "Phone number already registered" });
    }

    // Hash password
    const hashedPassword = await argon2.hash(password);

    // 1️⃣ Insert into USERS (Supervisor)
    const userInsert = await pg.query(
      `INSERT INTO users (user_name, user_password, phone, user_role)
       VALUES ($1, $2, $3, 'SUPERVISOR')
       RETURNING user_id`,
      [name, hashedPassword, phone]
    );

    const newUserId = userInsert.rows[0].user_id;

    // 2️⃣ Insert into ASHA_WORKERS (supervisor has no supervisor_id)
    const ashaInsert = await pg.query(
      `INSERT INTO asha_workers
        (user_id, village, district, taluka, profile_pic, supervisor_id)
       VALUES ($1, $2, $3, $4, $5, NULL)
       RETURNING asha_id`,
      [newUserId, village, district, taluka, profilePic || null]
    );

    const newAshaId = ashaInsert.rows[0].asha_id;

    // JWT token (store user_id in token)
    const token = getToken(String(newUserId));

    return res.status(201).json({
      message: "Supervisor registered successfully",
      supervisor: {
        userId: newUserId,
        ashaId: newAshaId,
        name,
        phone,
        role: "SUPERVISOR",
      },
      token,
    });
  } catch (error) {
    console.error("Error in /register-supervisor:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * Supervisor registers an ASHA
 * POST /asha/register-asha
 */
asha.post(
  "/register-asha",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      console.log("Supervisor → Register ASHA Worker");
      const loggedInUserId = (req as any).user; // user_id from JWT
      const pg = getPgClient();

      // 1️⃣ Check if logged-in user is a SUPERVISOR (in USERS table)
      const supervisorUser = await pg.query(
        "SELECT user_role FROM users WHERE user_id = $1",
        [loggedInUserId]
      );

      if (supervisorUser.rows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      if (supervisorUser.rows[0].user_role !== "SUPERVISOR") {
        return res
          .status(403)
          .json({ message: "Only Supervisors can register ASHA workers" });
      }

      // 2️⃣ Get supervisor's ASHA ID (from asha_workers)
      const supervisorAsha = await pg.query(
        "SELECT asha_id FROM asha_workers WHERE user_id = $1",
        [loggedInUserId]
      );

      if (supervisorAsha.rows.length === 0) {
        return res.status(404).json({
          message: "Supervisor ASHA profile not found",
        });
      }

      const supervisorAshaId = supervisorAsha.rows[0].asha_id;

      // 3️⃣ Extract request body
      const { name, password, phone, village, district, taluka, profilePic } =
        req.body;

      if (!name || !password || !phone || !village || !district || !taluka) {
        return res.status(400).json({
          message: "All fields except profile pic are required",
        });
      }

      // 4️⃣ Check if phone exists in USERS
      const existing = await pg.query(
        "SELECT user_id FROM users WHERE phone = $1",
        [phone]
      );

      if (existing.rows.length > 0) {
        return res
          .status(409)
          .json({ message: "Phone number already registered" });
      }

      // 5️⃣ Create USER entry (role = ASHA)
      const hashedPassword = await argon2.hash(password);

      const userInsert = await pg.query(
        `INSERT INTO users (user_name, user_password, phone, user_role)
       VALUES ($1, $2, $3, 'ASHA')
       RETURNING user_id`,
        [name, hashedPassword, phone]
      );

      const newUserId = userInsert.rows[0].user_id;

      // 6️⃣ Create ASHA WORKER entry
      const ashaInsert = await pg.query(
        `INSERT INTO asha_workers
        (user_id, village, district, taluka, profile_pic, supervisor_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING asha_id`,
        [
          newUserId,
          village,
          district,
          taluka,
          profilePic || null,
          supervisorAshaId,
        ]
      );

      return res.status(201).json({
        message: "ASHA worker registered successfully",
        asha: {
          userId: newUserId,
          ashaId: ashaInsert.rows[0].asha_id,
          supervisorId: supervisorAshaId,
          name,
          phone,
          role: "ASHA",
        },
      });
    } catch (error) {
      console.error("Error in /register-asha:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

/**
 * Asha profile
 * GET /asha/profile
 * Protected: requires Authorization: Bearer <token>
 */
asha.get("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();

    const userId = (req as any).user; // user_id from token
    if (!userId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    // JOIN users + asha_workers
    const result = await pg.query(
      `SELECT 
          u.user_id,
          u.user_name,
          u.phone,
          u.user_role,
          u.created_at AS user_created_at,

          a.asha_id,
          a.village,
          a.district,
          a.taluka,
          a.profile_pic,
          a.supervisor_id
       FROM asha_workers a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "ASHA profile not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error in GET /asha/profile:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * Asha registers a patient (protected)
 * POST /asha/patient/register
 */
asha.post(
  "/patient/register",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      console.log("Asha → Register Patient");

      const pg = getPgClient();
      const ashaUserId = (req as any).user; // user_id from JWT

      if (!ashaUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get ASHA's asha_id so we can store it in patient.registered_asha_id
      const ashaRow = await pg.query(
        `SELECT asha_id FROM asha_workers WHERE user_id = $1`,
        [ashaUserId]
      );

      if (ashaRow.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "ASHA worker profile not found" });
      }

      const registeredAshaId = ashaRow.rows[0].asha_id;

      const {
        name,
        password,
        gender,
        dob,
        phone,
        profile_pic,
        village,
        taluka,
        district,
        history,
        supreme_id,
      } = req.body;

      // Required fields
      if (
        !name ||
        !password ||
        !gender ||
        !phone ||
        !village ||
        !taluka ||
        !district
      ) {
        return res.status(400).json({
          message: "Missing required fields",
        });
      }

      // (Optional) Check if a PATIENT user with same phone already exists
      await pg.query(
        "SELECT user_id FROM users WHERE phone = $1 AND user_role = 'PATIENT'",
        [phone]
      );

      // Hash password
      const hashedPassword = await argon2.hash(password);

      // Step 1: Create user entry
      const userInsert = await pg.query(
        `INSERT INTO users (user_name, user_password, phone, user_role)
         VALUES ($1, $2, $3, 'PATIENT')
         RETURNING user_id, created_at`,
        [name, hashedPassword, phone]
      );

      const newUserId = userInsert.rows[0].user_id;

      // Step 2: Insert into patient table
      // Step 2: Insert into patient table (without supreme_id first)
      const gender1 = gender.toString().toUpperCase();
      const patientInsert = await pg.query(
        `INSERT INTO patient (
      user_id,
      gender,
      dob,
      phone,
      profile_pic,
      village,
      taluka,
      district,
      history,
      registered_asha_id
   )
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   RETURNING patient_id`,
        [
          newUserId,
          gender1,
          dob ?? null,
          phone,
          profile_pic ?? null,
          village,
          taluka,
          district,
          history ?? null,
          registeredAshaId,
        ]
      );

      const newPatientId = patientInsert.rows[0].patient_id;

      // Step 3: Self-assign supreme_id if not provided
      const finalSupremeId = supreme_id ?? newPatientId;

      // Step 4: Update patient to set correct supreme_id
      await pg.query(
        `UPDATE patient SET supreme_id = $1 WHERE patient_id = $2`,
        [finalSupremeId, newPatientId]
      );

      // Final Response
      return res.status(201).json({
        message: "Patient registered successfully by ASHA",
        user_id: newUserId,
        patient_id: newPatientId,
        supreme_id: finalSupremeId,
      });

      return res.status(201).json({
        message: "Patient registered successfully by ASHA",
        user_id: newUserId,
        patient: patientInsert.rows[0],
      });
    } catch (error) {
      console.error("Error in /patient/register:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

/**
 * ASHA self profile update
 * PUT /asha/profile
 * - Allows ASHA to update: password, phone (users table) and profile_pic (asha_workers)
 * - Name / address / role are blocked (only supervisor can change)
 */
asha.put("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const userId = (req as any).user; // user_id from token

    if (!userId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const {
      asha_password,
      asha_phone,
      asha_profile_pic,
      asha_name,
      asha_village,
      asha_district,
      asha_taluka,
      asha_role,
    } = req.body;

    // Block restricted fields (only supervisor can change these)
    if (
      asha_name ||
      asha_village ||
      asha_district ||
      asha_taluka ||
      asha_role
    ) {
      return res.status(403).json({
        message:
          "Name, Village, District, Taluka and Role can only be updated by your Supervisor.",
      });
    }

    // Check if ANY allowed field is provided
    if (!asha_password && !asha_phone && !asha_profile_pic) {
      return res.status(400).json({
        message: "Provide password, phone, or profile picture to update",
      });
    }

    // 1️⃣ Update USERS (password / phone)
    if (asha_password || asha_phone) {
      const userFields: string[] = [];
      const userValues: any[] = [];
      let idx = 1;

      if (asha_password) {
        const hashed = await argon2.hash(asha_password);
        userFields.push(`user_password = $${idx++}`);
        userValues.push(hashed);
      }

      if (asha_phone) {
        userFields.push(`phone = $${idx++}`);
        userValues.push(asha_phone);
      }

      userValues.push(userId);

      await pg.query(
        `UPDATE users SET ${userFields.join(", ")} WHERE user_id = $${idx}`,
        userValues
      );
    }

    // 2️⃣ Update ASHA_WORKERS (profile_pic)
    if (asha_profile_pic) {
      await pg.query(
        `UPDATE asha_workers
         SET profile_pic = $1
         WHERE user_id = $2`,
        [asha_profile_pic, userId]
      );
    }

    // 3️⃣ Return updated profile (same as GET /asha/profile)
    const result = await pg.query(
      `SELECT 
          u.user_id,
          u.user_name,
          u.phone,
          u.user_role,
          u.created_at AS user_created_at,

          a.asha_id,
          a.village,
          a.district,
          a.taluka,
          a.profile_pic,
          a.supervisor_id
       FROM asha_workers a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "ASHA profile not found" });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("Error in PUT /profile:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * Supervisor updates an ASHA worker
 * PUT /asha/supervisor/update-asha/:id
 * :id = asha_id of ASHA to update
 */
asha.put(
  "/supervisor/update-asha/:id",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const supervisorUserId = (req as any).user; // user_id of supervisor
      const ashaIdToUpdate = Number(req.params.id);

      if (!Number.isInteger(ashaIdToUpdate) || ashaIdToUpdate <= 0) {
        return res.status(400).json({ message: "Invalid ASHA id" });
      }

      const {
        asha_name,
        asha_village,
        asha_district,
        asha_taluka,
        supervisor_id,
        status
      } = req.body;

      const pg = getPgClient();

      // 1️⃣ Check supervisor role from USERS table
      const supervisorUser = await pg.query(
        `SELECT user_role FROM users WHERE user_id = $1`,
        [supervisorUserId]
      );

      if (
        supervisorUser.rows.length === 0 ||
        supervisorUser.rows[0].user_role !== "SUPERVISOR"
      ) {
        return res
          .status(403)
          .json({ message: "Only Supervisors can update ASHA profiles" });
      }

      // 2️⃣ Get supervisor's own ASHA record (optional: enforce hierarchy)
      const supervisorAsha = await pg.query(
        `SELECT asha_id FROM asha_workers WHERE user_id = $1`,
        [supervisorUserId]
      );

      if (supervisorAsha.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "Supervisor ASHA profile not found" });
      }

      const supervisorAshaId = supervisorAsha.rows[0].asha_id;

      // 3️⃣ Load ASHA to update
      const ashaRow = await pg.query(
        `SELECT asha_id, user_id, supervisor_id, status
         FROM asha_workers 
         WHERE asha_id = $1`,
        [ashaIdToUpdate]
      );

      if (ashaRow.rows.length === 0) {
        return res.status(404).json({ message: "ASHA not found" });
      }

      const ashaUserId = ashaRow.rows[0].user_id;

      // Optional: ensure this ASHA belongs to this supervisor
      // if (ashaRow.rows[0].supervisor_id !== supervisorAshaId) { ... }

      // 4️⃣ Validate at least one field provided
      if (
        !asha_name &&
        !asha_village &&
        !asha_district &&
        !asha_taluka &&
        !supervisor_id &&
        !status
      ) {
        return res
          .status(400)
          .json({ message: "Please provide fields to update" });
      }

      // 5️⃣ Build UPDATE for asha_workers (village/district/taluka/supervisor_id)
      const fieldsAsha: string[] = [];
      const valuesAsha: any[] = [];
      let idx = 1;

      if (asha_village) {
        fieldsAsha.push(`village = $${idx++}`);
        valuesAsha.push(asha_village);
      }
      if (asha_district) {
        fieldsAsha.push(`district = $${idx++}`);
        valuesAsha.push(asha_district);
      }
      if (asha_taluka) {
        fieldsAsha.push(`taluka = $${idx++}`);
        valuesAsha.push(asha_taluka);
      }
      if (supervisor_id) {
        fieldsAsha.push(`supervisor_id = $${idx++}`);
        valuesAsha.push(supervisor_id);
      }

      if (fieldsAsha.length > 0) {
        valuesAsha.push(ashaIdToUpdate);
        await pg.query(
          `
          UPDATE asha_workers
          SET ${fieldsAsha.join(", ")}
          WHERE asha_id = $${idx}
        `,
          valuesAsha
        );
      }

      // 6️⃣ Update ASHA's name in USERS if provided
      if (asha_name) {
        await pg.query(`UPDATE users SET user_name = $1 WHERE user_id = $2`, [
          asha_name,
          ashaUserId,
        ]);
      }

      // 7️⃣ Return updated ASHA (join users + asha_workers)
      const updatedRes = await pg.query(
        `SELECT 
           a.asha_id,
           u.user_name AS asha_name,
           u.phone     AS asha_phone,
           a.village,
           a.district,
           a.taluka,
           a.profile_pic,
           a.supervisor_id
         FROM asha_workers a
         JOIN users u ON a.user_id = u.user_id
         WHERE a.asha_id = $1`,
        [ashaIdToUpdate]
      );

      return res.status(200).json({
        message: "ASHA updated successfully by Supervisor",
        updatedAsha: updatedRes.rows[0],
      });
    } catch (err) {
      console.error("Error updating ASHA:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

/**
 * Supervisor: view all ASHAs under them
 * GET /asha/all-ashas
 */
asha.get("/all-ashas", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const supervisorUserId = (req as any).user; // user_id

    // 1️⃣ Check if logged in user is a Supervisor (USERS)
    const checkUser = await pg.query(
      `SELECT user_role FROM users WHERE user_id = $1`,
      [supervisorUserId]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({ message: "Logged in user not found" });
    }

    if (checkUser.rows[0].user_role !== "SUPERVISOR") {
      return res
        .status(403)
        .json({ message: "Only Supervisors can view all ASHA workers" });
    }

    // 2️⃣ Get supervisor's ASHA id
    const supAshaRes = await pg.query(
      `SELECT asha_id FROM asha_workers WHERE user_id = $1`,
      [supervisorUserId]
    );

    if (supAshaRes.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Supervisor ASHA profile not found" });
    }

    const supervisorAshaId = supAshaRes.rows[0].asha_id;

    // 3️⃣ Fetch all ASHA workers under this supervisor
    const result = await pg.query(
      `SELECT 
         a.asha_id,
         u.user_name AS asha_name,
         u.phone     AS asha_phone,
         a.village,
         a.district,
         a.taluka,
         a.profile_pic,
         a.status
       FROM asha_workers a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.supervisor_id = $1
         AND u.user_role = 'ASHA'`,
      [supervisorAshaId]
    );

    return res.status(200).json({ ashas: result.rows });
  } catch (error) {
    console.error("Error in /all-ashas:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


// -----------------------------------------

asha.post("/supervisor/send-to-asha",verifyToken, async (req, res) => {
  const {  notice_id } = req.body;
  const supervisor_user_id = (req as any).user; // from JWT
  const pool = getPgClient();

  try {
    // 1. Get village of Supervisor
    const supRes = await pool.query(
      "SELECT village FROM supervisor_details WHERE user_id = $1",
      [supervisor_user_id]
    );

    const village = supRes.rows[0].village;

    // 2. Get all ASHA workers of same village
    const ashaRes = await pool.query(
      "SELECT user_id FROM asha_workers WHERE village = $1",
      [village]
    );

    // 3. Send notifications
    for (let a of ashaRes.rows) {
      const tokenRes = await pool.query(
        "SELECT fcm_token FROM device_tokens WHERE user_id = $1",
        [a.user_id]
      );

      if (tokenRes.rows.length === 0) continue;
      const token = tokenRes.rows[0].fcm_token;

      await pool.query(
        "INSERT INTO notifications (notice_id, receiver_user_id, fcm_token) VALUES ($1, $2, $3)",
        [notice_id, a.user_id, token]
      );

      const noticeInfo = await pool.query(
        "SELECT title, body FROM notices WHERE notice_id = $1",
        [notice_id]
      );

      await sendFCM(token, noticeInfo.rows[0].title, noticeInfo.rows[0].body);
    }

    res.json({ success: true, message: "Notified all ASHA workers" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


asha.post("/asha/send-to-patients",verifyToken, async (req, res) => {
  const {  notice_id } = req.body;
  const pool = getPgClient();
  const asha_user_id = (req as any).user; // from JWT

  try {
    // 1. Get ASHA village
    const ashaRes = await pool.query(
      "SELECT village FROM asha_workers WHERE user_id = $1",
      [asha_user_id]
    );
    const village = ashaRes.rows[0].village;

    // 2. Patients of same village
    const patientsRes = await pool.query(
      "SELECT user_id FROM users WHERE user_role = 'PATIENT' AND village = $1",
      [village]
    );

    for (let p of patientsRes.rows) {
      const tokenRes = await pool.query(
        "SELECT fcm_token FROM device_tokens WHERE user_id = $1",
        [p.user_id]
      );

      if (tokenRes.rows.length === 0) continue;

      const token = tokenRes.rows[0].fcm_token;

      await pool.query(
        `INSERT INTO notifications (notice_id, receiver_user_id, fcm_token)
         VALUES ($1, $2, $3)`,
        [notice_id, p.user_id, token]
      );

      const noticeInfo = await pool.query(
        "SELECT title, body FROM notices WHERE notice_id = $1",
        [notice_id]
      );

      await sendFCM(token, noticeInfo.rows[0].title, noticeInfo.rows[0].body);
    }

    res.json({ success: true, message: "Patients notified!" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
