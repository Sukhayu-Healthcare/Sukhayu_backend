import express, { type Request, type Response } from "express";
import { getPgClinent } from "../config/postgress.js";

export const patient = express.Router();

/**
 * @route POST /patient/register
 * @desc Register a new patient
 */
patient.post("/register", async (req: Request, res: Response) => {
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

    if (
      !patient_name ||
      !patient_password ||
      !patient_gender ||
      !patient_phone ||
      !patient_village ||
      !patient_taluka ||
      !patient_dist
    ) {
      return res.status(400).json({
        message: "Please fill all required fields",
      });
    }

    const pg = getPgClinent();

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

    const result = await pg.query(insertQuery, values);

    res.status(201).json({
      message: "Patient registered successfully",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error in /register:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

/**
 * @route GET /patient/all
 * @desc Fetch all patients
 */
patient.get("/all", async (req: Request, res: Response) => {
  try {
    const pg = getPgClinent();
    const result = await pg.query("SELECT * FROM patient ORDER BY patient_id ASC");

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error in /all:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});