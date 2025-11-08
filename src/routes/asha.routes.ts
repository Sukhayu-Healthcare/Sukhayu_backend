import express, { type Request, type Response } from "express";
import { getPgClinent } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const asha = express.Router();

asha.post("/login", async (req: Request, res: Response) => {
  try {
    const { ashaId, password } = req.body;
    if (!ashaId || !password) {
      res.status(400).json({
        message: "Please send ID and Password both",
      });
      return;
    }
    const pg = getPgClinent();
    const result = await pg.query(
      `SELECT * FROM asha_workers WHERE asha_ID = $1`,
      [ashaId]
    );
    if (result.rows.length == 0) {
      res.status(404).json({
        message: "Asha Worker not found",
      });
      return;
    }
    const asha = result.rows[0];
    const compare = await argon2.verify(asha.asha_password, password);
    if (!compare) {
      res.status(404).json({
        message: "Invalid Credentials",
      });
      return;
    }

    const token = getToken(ashaId);
    res.status(200).json({
      ashaId,
      token,
    });
  } catch (error) {
    console.error("Error in /login:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

asha.get("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClinent();
    const ashaId = (req as any).user.ashaId;

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

asha.put("/profile", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClinent();
    const ashaId = (req as any).user.ashaId;

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
