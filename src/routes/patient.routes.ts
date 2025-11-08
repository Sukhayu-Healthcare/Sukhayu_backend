import { Router, Request, Response } from "express";
import { pool } from "../db/db"; // assumes you have db.ts exporting a pg Pool

const router = Router();

/**
 * @route   GET /api/v1/patients
 * @desc    Get all patients
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM patient ORDER BY patient_id ASC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching patients:", err);
    res.status(500).json({ message: "Error fetching patients" });
  }
});

/**
 * @route   POST /api/v1/patients
 * @desc    Add a new patient
 */
router.post("/", async (req: Request, res: Response) => {
  try {
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
    ];

    const result = await pool.query(insertQuery, values);
    res.status(201).json({
      message: "Patient created successfully",
      patient: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating patient:", err);
    res.status(500).json({ message: "Error creating patient" });
  }
});

export default router;