import express, { type Request, type Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const asha = express.Router();

asha.post("/register-supervisor", async (req: Request, res: Response) => {
  try {
    const {
      ashaName,
      password,
      ashaPhone,
      ashaVillage,
      ashaDistrict,
      ashaTaluka,
      ashaProfilePic,
      ashaRole,
    } = req.body;

    // Validate required fields
    if (
      !ashaName ||
      !password ||
      !ashaPhone ||
      !ashaVillage ||
      !ashaDistrict ||
      !ashaTaluka ||
      !ashaRole
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Only allow Supervisors to register
    if (ashaRole !== "SUPERVISOR") {
      return res.status(403).json({ message: "Only Supervisors can register" });
    }

    const pg = getPgClient();

    // Check if phone already exists
    const existing = await pg.query(
      "SELECT asha_ID FROM asha_workers WHERE asha_phone = $1",
      [ashaPhone]
    );

    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json({ message: "Phone number already registered" });
    }

    // Hash password
    const hashedPassword = await argon2.hash(password);

    // Insert Supervisor into DB
    const result = await pg.query(
      `INSERT INTO asha_workers
        (asha_name, asha_password, asha_phone, asha_village, asha_district, asha_taluka, asha_profile_pic, asha_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING asha_ID`,
      [
        ashaName,
        hashedPassword,
        ashaPhone,
        ashaVillage,
        ashaDistrict,
        ashaTaluka,
        ashaProfilePic || null,
        ashaRole,
      ]
    );

    const newAshaId = result.rows[0].asha_id;

    // Generate JWT token
    const token = getToken(String(newAshaId));

    return res.status(201).json({
      message: "Supervisor registered successfully",
      supervisorId: newAshaId,
      token,
    });
  } catch (error) {
    console.error("Error in /register-supervisor:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * Asha login
 * POST /asha/login
 * body: { ashaId, password }
 */
asha.post("/login", async (req: Request, res: Response) => {
  try {
    console.log("Asha");
    const { ashaId, password } = req.body;
    if (!ashaId || !password) {
      res.status(400).json({ message: "Please send ID and Password both" });
      return;
    }

    const pg = getPgClient();
    const result = await pg.query(
      `SELECT * FROM asha_workers WHERE asha_ID = $1`,
      [ashaId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: "Asha Worker not found" });
      return;
    }
    console.log("form Asha");
    const ashaRow = result.rows[0];

    const compare = await argon2.verify(ashaRow.asha_password, password);
    if (!compare) {
      res.status(401).json({ message: "Invalid Credentials" });
      return;
    }

    // getToken now signs { userId: ... }
    const token = getToken(String(ashaId));
    res.status(200).json({ ashaId, token });
  } catch (error) {
    console.error("Error in /login:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

asha.post(
  "/register-asha",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const loggedInAsha = (req as any).user; // from JWT: contains userId + role
      const pg = getPgClient();

      // Only Supervisor can register ASHA
      const check = await pg.query(
        "SELECT asha_role FROM asha_workers WHERE asha_ID = $1",
        [loggedInAsha]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ message: "Logged in ASHA not found" });
      } else if (check.rows[0].asha_role != "SUPERVISOR") {
        return res
          .status(403)
          .json({ message: "Only Supervisors can register ASHA workers" });
      }

      const {
        asha_name,
        asha_password,
        asha_village,
        asha_phone,
        asha_district,
        asha_taluka,
        asha_profile_pic,
      } = req.body;

      // Validate required fields
      if (
        !asha_name ||
        !asha_password ||
        !asha_village ||
        !asha_phone ||
        !asha_district ||
        !asha_taluka
      ) {
        return res
          .status(400)
          .json({ message: "All fields except profile pic are required" });
      }

      // Check if phone already exists
      const exists = await pg.query(
        "SELECT * FROM asha_workers WHERE asha_phone = $1",
        [asha_phone]
      );

      if (exists.rows.length > 0) {
        return res
          .status(409)
          .json({ message: "Phone number already registered" });
      }

      // Hash password
      const hashedPassword = await argon2.hash(asha_password);

      // Insert ASHA worker (role = ASHA)
      const result = await pg.query(
        `INSERT INTO asha_workers 
        (asha_name, asha_password, asha_village, asha_phone, asha_district, asha_taluka, asha_profile_pic, asha_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ASHA')
       RETURNING asha_ID, asha_name, asha_phone, asha_role`,
        [
          asha_name,
          hashedPassword,
          asha_village,
          asha_phone,
          asha_district,
          asha_taluka,
          asha_profile_pic || null,
        ]
      );

      return res.status(201).json({
        message: "ASHA registered successfully",
        asha: result.rows[0],
      });
    } catch (error) {
      console.error("Error in /asha/register:", error);
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

    // middleware puts the id string directly on req.user
    const ashaId = (req as any).user;
    if (!ashaId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const result = await pg.query(
      `SELECT asha_ID, asha_name, asha_village, asha_phone, asha_district, asha_taluka, asha_profile_pic, asha_role, asha_created_at
       FROM asha_workers WHERE asha_ID = $1`,
      [ashaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Profile not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error in /profile:", error);
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
      const ashaId = (req as any).user; // JWT userId = asha_ID

      if (!ashaId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const {
        patient_name,
        patient_password,
        patient_gender,
        patient_dob,
        patient_phone,
        patient_profile_pic,
        patient_village,
        patient_taluka,
        patient_dist,
        patient_hist,
        patient_supreme_id
      } = req.body;

      // Required fields validation
      if (
        !patient_name ||
        !patient_password ||
        !patient_gender ||
        !patient_phone ||
        !patient_village ||
        !patient_taluka ||
        !patient_dist ||
        !patient_supreme_id
      ) {
        return res.status(400).json({
          message: "Please provide all required patient fields",
        });
      }

      // hash password before storing
      const hashed = await argon2.hash(patient_password);

      const insertQuery = `
        INSERT INTO patient (
          patient_name, patient_password, patient_gender, patient_dob,
          patient_phone, patient_profile_pic, patient_village,
          patient_taluka, patient_dist, patient_hist, registered_asha_id ,patient_supreme_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *;
      `;

      const values = [
        patient_name,
        hashed,
        patient_gender,
        patient_dob ?? null,
        patient_phone,
        patient_profile_pic ?? null,
        patient_village,
        patient_taluka,
        patient_dist,
        patient_hist ?? null,
        ashaId, // <-- THE IMPORTANT PART: which ASHA registered
        patient_supreme_id
      ];

      const result = await pg.query(insertQuery, values);

      res.status(201).json({
        message: "Patient registered successfully by ASHA",
        patient: result.rows[0],
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
