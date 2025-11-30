import express from "express";
import type { Request, Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const doctor = express.Router();

/* ============================
   DOCTOR LOGIN
============================ */
doctor.post("/login", async (req: Request, res: Response) => {
  try {
    console.log("Doct")
    const { doc_id, doc_phone, password } = req.body;

    if ((!doc_id && !doc_phone) || !password) {
      return res.status(400).json({
        message: "Provide Doctor ID or Phone with Password",
      });
    }

    const pg = getPgClient();

    const result = await pg.query(
      `SELECT * FROM doctors WHERE doc_id = $1 OR doc_phone = $2`,
      [doc_id || null, doc_phone || null]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    const doctorRow = result.rows[0];

    const validPassword = await argon2.verify(
      doctorRow.doc_password,
      password
    );

    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = getToken(String(doctorRow.doc_id));

    res.json({
      message: "Login successful",
      token,
      doctor: doctorRow
    });

  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================
   AUTO STATUS + CONSULTATION
============================ */
doctor.post("/consultation-with-items", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user.userId;
    const { patient_id, diagnosis, notes, items } = req.body;

    // Set doctor BUSY
    await pg.query(`UPDATE doctors SET doc_status='ON' WHERE doc_id=$1`, [doctorId]);

    const consultRes = await pg.query(
      `INSERT INTO consultations (patient_id, doc_id, diagnosis, notes)
       VALUES ($1,$2,$3,$4)
       RETURNING consultation_id, consultation_date`,
      [patient_id, doctorId, diagnosis ?? null, notes ?? null]
    );

    const consultation_id = consultRes.rows[0].consultation_id;

    if (Array.isArray(items) && items.length) {
      const values: any[] = [];
      const rows = items.map((it: any, i: number) => {
        const base = i * 6;
        values.push(
          consultation_id,
          it.medicine_name,
          it.dosage ?? null,
          it.frequency ?? null,
          it.duration ?? null,
          it.instructions ?? null
        );
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`;
      });

      await pg.query(
        `INSERT INTO prescription_items
        (consultation_id, medicine_name, dosage, frequency, duration, instructions)
        VALUES ${rows.join(",")}`, values
      );
    }

    // Set doctor AVAILABLE again
    await pg.query(`UPDATE doctors SET doc_status='OFF' WHERE doc_id=$1`, [doctorId]);

    res.status(201).json({
      message: "Consultation completed",
      consultation_id,
      consultation_date: consultRes.rows[0].consultation_date
    });

  } catch (error) {
    const pg = getPgClient();
    const doctorId = (req as any).user.userId;

    await pg.query(`UPDATE doctors SET doc_status='OFF' WHERE doc_id=$1`, [doctorId]);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================
   GET OWN CONSULTATIONS
============================ */
doctor.get("/consultations", verifyToken, async (req: Request, res: Response) => {
  const pg = getPgClient();
  const doctorId = (req as any).user.userId;

  const result = await pg.query(
    `SELECT * FROM consultations WHERE doc_id=$1 ORDER BY consultation_date DESC`,
    [doctorId]
  );

  res.json({
    total: result.rows.length,
    consultations: result.rows
  });
});


doctor.post("/register", async (req, res) => {
  try {
    console.log("Register Doctor");
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
      doc_speciality
    } = req.body;

    // Required fields check
    if (
      !doc_name || !doc_password || !doc_role ||
      !hospital_address || !hospital_village ||
      !hospital_taluka || !hospital_district || !hospital_state ||
      !doc_phone
    ) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Validate doc_role
    const validRoles = ["CHO", "PHC", "CIVIL"];
    if (!validRoles.includes(doc_role)) {
      return res.status(400).json({ message: "Invalid doctor role" });
    }

    // Hash Password
    const hashedPassword = await argon2.hash(doc_password);

    // Insert Doctor
    const query = `
      INSERT INTO doctors 
      (doc_name, doc_password, doc_profile_pic, doc_role, hospital_address,
       hospital_village, hospital_taluka, hospital_district, hospital_state,
       doc_phone, doc_speciality)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING doc_id, doc_name, doc_role, doc_phone, doc_status, doc_created_at;
    `;

    const values = [
      doc_name,
      hashedPassword,
      doc_profile_pic || null,
      doc_role,
      hospital_address,
      hospital_village,
      hospital_taluka,
      hospital_district,
      hospital_state,
      doc_phone,
      doc_speciality || null
    ];

    const result = await pg.query(query, values);

    res.status(201).json({
      message: "Doctor registered successfully",
      doctor: result.rows[0]
    });

  } catch (error) {
    console.error(error);

    if ((error as any).code === "23505") {
      return res.status(400).json({ message: "Phone number already registered" });
    }

    res.status(500).json({ message: "Server error", error: (error as any).message });
  }
});