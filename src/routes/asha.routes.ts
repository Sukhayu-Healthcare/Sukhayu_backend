import express, { type Request, type Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const asha = express.Router();

asha.post("/register-supervisor", async (req: Request, res: Response) => {
  try {
    const {
      name,
      password,
      phone,
      village,
      district,
      taluka,
      profilePic,
    } = req.body;

    // Validate required fields
    if (
      !name || !password || !phone ||
      !village || !district || !taluka
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const pg = getPgClient();

    // Check if phone already exists in USERS table
    const existing = await pg.query(
      "SELECT user_id FROM users WHERE phone = $1",
      [phone]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Phone number already registered" });
    }

    // Hash password
    const hashedPassword = await argon2.hash(password);

    // -----------------------------
    // 1️⃣ Insert into USERS (Supervisor)
    // -----------------------------
    const userInsert = await pg.query(
      `INSERT INTO users (user_name, user_password, phone, user_role)
       VALUES ($1, $2, $3, 'SUPERVISOR')
       RETURNING user_id`,
      [name, hashedPassword, phone]
    );

    const newUserId = userInsert.rows[0].user_id;

    // -----------------------------
    // 2️⃣ Insert into ASHA_WORKERS
    // supervisor has no supervisor_id
    // -----------------------------
    const ashaInsert = await pg.query(
      `INSERT INTO asha_workers
        (user_id, village, district, taluka, profile_pic, supervisor_id)
       VALUES ($1, $2, $3, $4, $5, NULL)
       RETURNING asha_id`,
      [newUserId, village, district, taluka, profilePic || null]
    );

    const newAshaId = ashaInsert.rows[0].asha_id;

    // JWT token
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


asha.post("/register-asha", verifyToken, async (req: Request, res: Response) => {
  try {
    const loggedInUserId = (req as any).user; // From JWT
    const pg = getPgClient();

    // 1️⃣ Check if logged-in user is a SUPERVISOR
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

    // 2️⃣ Get supervisor's ASHA ID
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
    const {
      name,
      password,
      phone,
      village,
      district,
      taluka,
      profilePic,
    } = req.body;

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
      [newUserId, village, district, taluka, profilePic || null, supervisorAshaId]
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
});
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
        supreme_id
      } = req.body;

      // Required fields
      if (!name || !password || !gender || !phone || !village || !taluka || !district) {
        return res.status(400).json({
          message: "Missing required fields",
        });
      }

      // Check if phone already used (multiple patients can have same phone)
      const usersWithPhone = await pg.query(
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
            supreme_id,
            registered_asha_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          newUserId,
          gender,
          dob ?? null,
          phone,
          profile_pic ?? null,
          village,
          taluka,
          district,
          history ?? null,
          supreme_id ?? null,
          ashaUserId // ASHA who registered
        ]
      );

      return res.status(201).json({
        message: "Patient registered successfully by ASHA",
        user_id: newUserId,
        patient: patientInsert.rows[0]
      });

    } catch (error) {
      console.error("Error in /patient/register:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);


asha.put("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const ashaId = (req as any).user; // token contains only userId as string

    if (!ashaId) {
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

    // ❌ Block restricted fields
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

    const fields: string[] = [];
    const values: any[] = [];
    let count = 1;

    // ✔ Update password if provided
    if (asha_password) {
      const hashed = await argon2.hash(asha_password);
      fields.push(`asha_password = $${count++}`);
      values.push(hashed);
    }

    // ✔ Update phone if provided
    if (asha_phone) {
      fields.push(`asha_phone = $${count++}`);
      values.push(asha_phone);
    }

    // ✔ Update profile pic if provided
    if (asha_profile_pic) {
      fields.push(`asha_profile_pic = $${count++}`);
      values.push(asha_profile_pic);
    }

    // Add ID at end for WHERE clause
    values.push(ashaId);

    const query = `
      UPDATE asha_workers
      SET ${fields.join(", ")}
      WHERE asha_ID = $${count}
      RETURNING 
        asha_ID, asha_name, asha_phone, asha_profile_pic, 
        asha_village, asha_district, asha_taluka, asha_role
    `;

    const result = await pg.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Asha profile not found" });
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

asha.put(
  "/supervisor/update-asha/:id",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const supervisorId = (req as any).user; // token contains userId only
      const ashaIdToUpdate = req.params.id;

      const {
        asha_name,
        asha_village,
        asha_district,
        asha_taluka,
        supervisor_id,
      } = req.body;

      // First check: Is logged user a supervisor?
      const pg = getPgClient();
      const supervisorCheck = await pg.query(
        `SELECT asha_role FROM asha_workers WHERE asha_ID = $1`,
        [supervisorId]
      );

      if (
        supervisorCheck.rows.length === 0 ||
        supervisorCheck.rows[0].asha_role !== "SUPERVISOR"
      ) {
        return res
          .status(403)
          .json({ message: "Only Supervisors can update ASHA profiles" });
      }

      // Nothing provided?
      if (
        !asha_name &&
        !asha_village &&
        !asha_district &&
        !asha_taluka &&
        !supervisor_id
      ) {
        return res
          .status(400)
          .json({ message: "Please provide fields to update" });
      }

      const fields: string[] = [];
      const values: any[] = [];
      let count = 1;

      if (asha_name) {
        fields.push(`asha_name = $${count++}`);
        values.push(asha_name);
      }
      if (asha_village) {
        fields.push(`asha_village = $${count++}`);
        values.push(asha_village);
      }
      if (asha_district) {
        fields.push(`asha_district = $${count++}`);
        values.push(asha_district);
      }
      if (asha_taluka) {
        fields.push(`asha_taluka = $${count++}`);
        values.push(asha_taluka);
      }
      if (supervisor_id) {
        fields.push(`supervisor_id = $${count++}`);
        values.push(supervisor_id);
      }

      // Push ASHA ID for WHERE clause
      values.push(ashaIdToUpdate);

      const query = `
      UPDATE asha_workers
      SET ${fields.join(", ")}
      WHERE asha_ID = $${count}
      RETURNING asha_ID, asha_name, asha_village, asha_district, asha_taluka, supervisor_id;
    `;

      const result = await pg.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Asha not found" });
      }

      res.status(200).json({
        message: "Asha updated successfully by Supervisor",
        updatedAsha: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating ASHA:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

asha.get("/all-ashas", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const loggedInAshaId = (req as any).user;

    // Check if logged in ASHA is a Supervisor
    const check = await pg.query(
      "SELECT asha_role FROM asha_workers WHERE asha_ID = $1",
      [loggedInAshaId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Logged in ASHA not found" });
    } else if (check.rows[0].asha_role != "SUPERVISOR") {
      return res
        .status(403)
        .json({ message: "Only Supervisors can view all ASHA workers" });
    }

    // Fetch all ASHA workers
    const result = await pg.query(
      `SELECT asha_ID, asha_name, asha_phone, asha_village, asha_profile_pic,
       FROM asha_workers WHERE asha_role = 'ASHA' AND supervisor_id = $1`,[loggedInAshaId]
    );

    return res.status(200).json({ ashas: result.rows });
  } catch (error) {
    console.error("Error in /all-ashas:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
