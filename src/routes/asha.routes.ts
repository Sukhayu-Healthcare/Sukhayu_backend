import express, { type Request, type Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const asha = express.Router();

/**
 * Asha login
 * POST /asha/login
 * body: { ashaId, password }
 */
asha.post("/login", async (req: Request, res: Response) => {
  try {
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
    console.log("form Asha")
    const ashaRow = result.rows[0];


    // argon2.verify(hash, plainPassword)
    // const compare = await argon2.verify(ashaRow.asha_password, password);
    // if (!compare) {
    //   res.status(401).json({ message: "Invalid Credentials" });
    //   return;
    // }

    // getToken now signs { userId: ... }
    const token = getToken(String(ashaId));
    res.status(200).json({ ashaId, token });
  } catch (error) {
    console.error("Error in /login:", error);
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
 * Asha updates own profile
 * PUT /asha/profile
 * Protected
 */
asha.put("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const ashaId = (req as any).user;
    if (!ashaId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const {
      asha_name,
      asha_village,
      asha_phone,
      asha_district,
      asha_taluka,
      asha_profile_pic,
    } = req.body;

    if (
      !asha_name &&
      !asha_village &&
      !asha_phone &&
      !asha_district &&
      !asha_taluka &&
      !asha_profile_pic
    ) {
      return res.status(400).json({
        message: "Please provide at least one field to update",
      });
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
    if (asha_phone) {
      fields.push(`asha_phone = $${count++}`);
      values.push(asha_phone);
    }
    if (asha_district) {
      fields.push(`asha_district = $${count++}`);
      values.push(asha_district);
    }
    if (asha_taluka) {
      fields.push(`asha_taluka = $${count++}`);
      values.push(asha_taluka);
    }
    if (asha_profile_pic) {
      fields.push(`asha_profile_pic = $${count++}`);
      values.push(asha_profile_pic);
    }

    values.push(ashaId);

    const query = `
      UPDATE asha_workers
      SET ${fields.join(", ")}
      WHERE asha_ID = $${count}
      RETURNING asha_ID, asha_name, asha_village, asha_phone, asha_district, asha_taluka, asha_profile_pic, asha_role, asha_created_at
    `;

    const result = await pg.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Profile not found" });
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
 * Asha registers a patient (protected)
 * POST /asha/patient/register
 */
asha.post(
  "/patient/register",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const pg = getPgClient();
      const ashaId = (req as any).user;
      if (!ashaId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const {
        patient_name,
        patient_password,
        patient_gender,
        patient_dob,
        patient_phone,
        patient_supreme_id,
        patient_profile_pic,
        patient_village,
        patient_taluka,
        patient_dist,
        patient_hist,
      } = req.body;

      if (
        !patient_name ||
        !patient_password ||
        !patient_gender ||
        !patient_phone ||
        !patient_village ||
        !patient_taluka ||
        !patient_dist
      ) {
        return res
          .status(400)
          .json({ message: "Please provide all required patient fields" });
      }

      // hash password before storing
      const hashed = await argon2.hash(patient_password);

      const insertQuery = `
        INSERT INTO patient (
          patient_name, patient_password, patient_gender, patient_dob,
          patient_phone, patient_supreme_id, patient_profile_pic,
          patient_village, patient_taluka, patient_dist, patient_hist
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *;
      `;

      const values = [
        patient_name,
        hashed,
        patient_gender,
        patient_dob ?? null,
        patient_phone,
        patient_supreme_id ?? null,
        patient_profile_pic ?? null,
        patient_village,
        patient_taluka,
        patient_dist,
        patient_hist ?? null,
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
