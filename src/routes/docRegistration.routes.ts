import express from "express";
import type { Request, Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";

export const doctor = express.Router();

/* ============================================================
   🟢 DOCTOR REGISTRATION
   Body must match DoctorRegisterBody
============================================================ */
doctor.post("/register", async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();

    const {
      doc_name,
      doc_password,
      doc_profile_pic,
      doc_role,
      hospital_address,
      hospital_village,
      hospital_taluka,
      hospital_district,
      hospital_state,
      doc_phone,
      doc_speciality,
      doc_status
    } = req.body;

    /* --------------------------------------------------------
       1️⃣ VALIDATION
    -------------------------------------------------------- */

    // Required fields check
    if (
      !doc_name ||
      !doc_password ||
      !doc_role ||
      !hospital_address ||
      !hospital_village ||
      !hospital_taluka ||
      !hospital_district ||
      !hospital_state ||
      !doc_phone
    ) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Validate Doctor Role
    const validRoles = ["CHO", "PHC", "CIVIL"];
    if (!validRoles.includes(doc_role)) {
      return res.status(400).json({ message: "Invalid doctor role" });
    }

    // Validate phone number
    if (doc_phone < 6000000000 || doc_phone > 9999999999) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    /* --------------------------------------------------------
       2️⃣ HASH PASSWORD
    -------------------------------------------------------- */
    const hashedPassword = await argon2.hash(doc_password);

    /* --------------------------------------------------------
       3️⃣ INSERT INTO DATABASE
    -------------------------------------------------------- */
    const query = `
      INSERT INTO doctors (
        doc_name, doc_password, doc_profile_pic, doc_role,
        hospital_address, hospital_village, hospital_taluka,
        hospital_district, hospital_state,
        doc_phone, doc_speciality, doc_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING doc_id, doc_name, doc_role, doc_phone, doc_status, doc_created_at;
    `;

    const values = [
      doc_name,
      hashedPassword,
      doc_profile_pic ?? null,
      doc_role,
      hospital_address,
      hospital_village,
      hospital_taluka,
      hospital_district,
      hospital_state,
      doc_phone,
      doc_speciality ?? null,
      doc_status ?? "OFF" // default OFF
    ];

    const result = await pg.query(query, values);

    /* --------------------------------------------------------
       4️⃣ RETURN SUCCESS
    -------------------------------------------------------- */
    return res.status(201).json({
      message: "Doctor registered successfully",
      doctor: result.rows[0]
    });

  } catch (err: any) {
    console.error("Doctor Registration Error:", err);

    if (err.code === "23505") {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    return res.status(500).json({ message: "Internal Server Error" });
  }
});
