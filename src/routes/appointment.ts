import type { Request, Response } from "express";
import express from "express";
import { verifyToken } from "../utils/middleware.js";
import { getPgClient } from "../config/postgress.js";

export const router = express.Router();

// BOOK APPOINTMENT
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const patient_id = (req as any).user; // patient from token
    const { doctor_id, appointment_date, appointment_time, notes } = req.body;

    if (!doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        error: "doctor_id, appointment_date and appointment_time are required"
      });
    }

    const pg = getPgClient();

    // 1️⃣ Check if doctor exists
    const doctorCheck = await pg.query(
      "SELECT doc_id FROM doctors WHERE doc_id = $1",
      [doctor_id]
    );

    if (doctorCheck.rows.length === 0) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    // 2️⃣ Check if patient already booked at same time
    const patientConflict = await pg.query(
      `SELECT appointment_id 
       FROM appointments 
       WHERE patient_id = $1 AND appointment_date = $2 AND appointment_time = $3`,
      [patient_id, appointment_date, appointment_time]
    );

    if (patientConflict.rows.length > 0) {
      return res.status(400).json({
        error: "You already have an appointment at this time"
      });
    }

    // 3️⃣ Check if doctor is already booked at same time
    const doctorConflict = await pg.query(
      `SELECT appointment_id 
       FROM appointments 
       WHERE doctor_id = $1 AND appointment_date = $2 AND appointment_time = $3`,
      [doctor_id, appointment_date, appointment_time]
    );

    if (doctorConflict.rows.length > 0) {
      return res.status(400).json({
        error: "Doctor is not available at this time"
      });
    }

    // 4️⃣ Insert appointment
    const insertQuery = `
      INSERT INTO appointments
        (patient_id, doctor_id, appointment_date, appointment_time, notes)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING appointment_id, patient_id, doctor_id, appointment_date, appointment_time, notes
    `;

    const result = await pg.query(insertQuery, [
      patient_id,
      doctor_id,
      appointment_date,
      appointment_time,
      notes || null
    ]);

    res.status(201).json({
      message: "Appointment booked successfully",
      appointment: result.rows
    });

  } catch (err) {
    console.error("Error booking appointment:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
      const pg = getPgClient();
  
      const result = await pg.query(`
        SELECT 
          doc_id,
          doc_name,
          doc_profile_pic,
          doc_role,
          hospital_address,
          hospital_village,
          hospital_taluka,
          hospital_district,
          hospital_state,
          doc_phone,
          doc_speciality,
          doc_status,
          doc_created_at
        FROM doctors
        ORDER BY doc_name ASC
      `);
  
      return res.json({
        total: result.rows.length,
        doctors: result.rows,
      });
  
    } catch (err) {
      console.error("Error fetching doctors:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  




