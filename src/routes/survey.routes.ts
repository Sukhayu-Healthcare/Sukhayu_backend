import express from "express";
import type { Request, Response } from "express";
import { getPgClient } from "../config/postgress.js";
import { verifyToken } from "../utils/middleware.js";

export const anc = express.Router();

/* ============================================================
   1️⃣ START SURVEY  (ASHA TOKEN REQUIRED)
============================================================ */
anc.post("/survey/start", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const ashaId = (req as any).user.userId;

    const { patient_id, survey_type } = req.body;

    const result = await pg.query(
      `INSERT INTO asha_surveys (asha_id, patient_id, survey_type)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [ashaId, patient_id, survey_type]
    );

    res.status(201).json({
      message: "Survey started successfully",
      survey: result.rows[0],
    });

  } catch (err) {
    console.error("Error starting survey:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   2️⃣ FIRST ANC VISIT SAVE
============================================================ */
anc.post("/first-visit", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const ashaId = (req as any).user.userId;

    const {
      survey_id,
      patient_id,
      lmp_date,
      edd_date,
      gravida,
      para,
      living_children,
      previous_complication,
      severe_bleeding,
      convulsions,
      high_bp_prev,
      illnesses,
      anc_visit_date,
      anc_place,
      delivery_place,
      danger_signs_explained,
      next_visit_date,
    } = req.body;

    const result = await pg.query(
      `INSERT INTO anc_first_visit (
        survey_id, patient_id, asha_id,
        lmp_date, edd_date, gravida, para, living_children,
        previous_complication, severe_bleeding, convulsions, high_bp_prev,
        illnesses, anc_visit_date, anc_place, delivery_place,
        danger_signs_explained, next_visit_date
      )
      VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,$16,
        $17,$18
      )
      RETURNING *`,
      [
        survey_id,
        patient_id,
        ashaId,
        lmp_date,
        edd_date,
        gravida,
        para,
        living_children,
        previous_complication,
        severe_bleeding,
        convulsions,
        high_bp_prev,
        illnesses,
        anc_visit_date,
        anc_place,
        delivery_place,
        danger_signs_explained,
        next_visit_date,
      ]
    );

    res.status(201).json({
      message: "First ANC Visit saved successfully",
      data: result.rows[0],
    });

  } catch (err) {
    console.error("Error saving first ANC visit:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   3️⃣ FOLLOW-UP ANC VISIT SAVE
============================================================ */
anc.post("/followup-visit", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const ashaId = (req as any).user.userId;

    const {
      survey_id,
      patient_id,
      visit_date,
      visit_number,
      facility_type,
      symptoms,
      bp_recorded,
      weight,
      ifa_given,
      calcium_given,
      tt_dose,
      referral_made,
      next_visit_date,
    } = req.body;

    const result = await pg.query(
      `INSERT INTO anc_followup_visit (
        survey_id, patient_id, asha_id,
        visit_date, visit_number, facility_type, symptoms,
        bp_recorded, weight, ifa_given, calcium_given,
        tt_dose, referral_made, next_visit_date
      )
      VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,
        $8,$9,$10,$11,
        $12,$13,$14
      )
      RETURNING *`,
      [
        survey_id,
        patient_id,
        ashaId,
        visit_date,
        visit_number,
        facility_type,
        symptoms,
        bp_recorded,
        weight,
        ifa_given,
        calcium_given,
        tt_dose,
        referral_made,
        next_visit_date,
      ]
    );

    res.status(201).json({
      message: "Follow-up ANC Visit saved successfully",
      data: result.rows[0],
    });

  } catch (err) {
    console.error("Error saving follow-up visit:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   4️⃣ GET ALL PATIENT SURVEYS + ASHA + SUPERVISOR
============================================================ */
anc.get("/patient/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const { id } = req.params;

    /* ----- First Visit With ASHA + Supervisor ----- */
    const first = await pg.query(
      `SELECT f.*, 
              s.asha_id, aw.asha_name,
              aw.supervisor_id, sp.supervisor_name
       FROM anc_first_visit f
       LEFT JOIN asha_surveys s ON f.survey_id = s.survey_id
       LEFT JOIN asha_workers aw ON s.asha_id = aw.asha_id
       LEFT JOIN asha_supervisors sp ON aw.supervisor_id = sp.supervisor_id
       WHERE f.patient_id = $1`,
      [id]
    );

    /* ----- Follow-up Visits With ASHA + Supervisor ----- */
    const follow = await pg.query(
      `SELECT fu.*, 
              s.asha_id, aw.asha_name,
              aw.supervisor_id, sp.supervisor_name
       FROM anc_followup_visit fu
       LEFT JOIN asha_surveys s ON fu.survey_id = s.survey_id
       LEFT JOIN asha_workers aw ON s.asha_id = aw.asha_id
       LEFT JOIN asha_supervisors sp ON aw.supervisor_id = sp.supervisor_id
       WHERE fu.patient_id = $1`,
      [id]
    );

    res.json({
      patient_id: id,

      first_visit: first.rows.map(v => ({
        ...v,
        handled_by_asha: {
          asha_id: v.asha_id,
          asha_name: v.asha_name
        },
        supervisor: {
          supervisor_id: v.supervisor_id,
          supervisor_name: v.supervisor_name
        }
      })),

      followup_visits: follow.rows.map(v => ({
        ...v,
        handled_by_asha: {
          asha_id: v.asha_id,
          asha_name: v.asha_name
        },
        supervisor: {
          supervisor_id: v.supervisor_id,
          supervisor_name: v.supervisor_name
        }
      })),
    });

  } catch (err) {
    console.error("Error fetching patient survey:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

anc.post("/save", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const ashaId = (req as any).user.userId;

    const {
      survey_id,
      patient_id,
      visit_date,
      child_age,
      weight,
      height,
      symptoms,
      vaccines_given,
      referral_needed,
      next_visit_date
    } = req.body;

    const result = await pg.query(
      `INSERT INTO child_health_surveys (
        survey_id, patient_id, asha_id,
        visit_date, child_age, weight, height,
        symptoms, vaccines_given,
        referral_needed, next_visit_date
      )
      VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,
        $8,$9,
        $10,$11
      )
      RETURNING *`,
      [
        survey_id,
        patient_id,
        ashaId,
        visit_date,
        child_age,
        weight,
        height,
        symptoms,
        vaccines_given, // send JSON string OR comma-separated
        referral_needed,
        next_visit_date
      ]
    );

    res.status(201).json({
      message: "Child health survey saved successfully",
      data: result.rows[0],
    });

  } catch (err) {
    console.error("Error saving child health survey:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   2️⃣ GET ALL CHILD HEALTH SURVEYS FOR A PATIENT
============================================================== */
anc.get("/child/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const { id } = req.params;

    const result = await pg.query(
      `SELECT ch.*,
              aw.asha_name,
              sp.supervisor_name
       FROM child_health_surveys ch
       LEFT JOIN asha_workers aw ON ch.asha_id = aw.asha_id
       LEFT JOIN asha_supervisors sp ON aw.supervisor_id = sp.supervisor_id
       WHERE ch.patient_id = $1
       ORDER BY ch.visit_date DESC`,
      [id]
    );

    res.json({
      patient_id: id,
      surveys: result.rows.map(row => ({
        ...row,
        handled_by_asha: {
          asha_id: row.asha_id,
          asha_name: row.asha_name
        },
        supervisor: {
          supervisor_id: row.supervisor_id,
          supervisor_name: row.supervisor_name
        }
      }))
    });

  } catch (err) {
    console.error("Error fetching child health survey:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

anc.post("/save", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const ashaId = (req as any).user.userId;

    const {
      survey_id,
      patient_id,
      cough_more_than_2_weeks,
      fever,
      night_sweats,
      weight_loss,
      blood_in_sputum,
      tb_contact_history,
      risk_factors,
      referral_needed,
      remarks
    } = req.body;

    const result = await pg.query(
      `INSERT INTO tb_surveys (
        survey_id, patient_id, asha_id,
        cough_more_than_2_weeks, fever, night_sweats, weight_loss, blood_in_sputum,
        tb_contact_history, risk_factors,
        referral_needed, remarks
      )
      VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,$8,
        $9,$10,
        $11,$12
      )
      RETURNING *`,
      [
        survey_id,
        patient_id,
        ashaId,
        cough_more_than_2_weeks,
        fever,
        night_sweats,
        weight_loss,
        blood_in_sputum,
        tb_contact_history,
        risk_factors,
        referral_needed,
        remarks
      ]
    );

    res.status(201).json({
      message: "TB survey saved successfully",
      data: result.rows[0],
    });

  } catch (err) {
    console.error("Error saving TB survey:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   2️⃣ GET ALL TB SURVEYS FOR A PATIENT
============================================================== */
anc.get("/tb/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const { id } = req.params;

    const result = await pg.query(
      `SELECT t.*,
              aw.asha_name,
              sp.supervisor_name
       FROM tb_surveys t
       LEFT JOIN asha_workers aw ON t.asha_id = aw.asha_id
       LEFT JOIN asha_supervisors sp ON aw.supervisor_id = sp.supervisor_id
       WHERE t.patient_id = $1
       ORDER BY t.created_at DESC`,
      [id]
    );

    res.json({
      patient_id: id,
      surveys: result.rows.map(row => ({
        ...row,
        handled_by_asha: {
          asha_id: row.asha_id,
          asha_name: row.asha_name
        },
        supervisor: {
          supervisor_id: row.supervisor_id,
          supervisor_name: row.supervisor_name
        }
      }))
    });

  } catch (err) {
    console.error("Error fetching TB surveys:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

anc.post("/save", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const ashaId = (req as any).user.userId;

    const {
      survey_id,
      patient_id,
      visit_date,
      existing_conditions,
      symptoms,
      risk_factors,
      bp_systolic,
      bp_diastolic,
      sugar_level,
      on_medication,
      referral_needed,
      remarks
    } = req.body;

    const result = await pg.query(
      `INSERT INTO general_screening_surveys (
        survey_id, patient_id, asha_id,
        visit_date,
        existing_conditions, symptoms, risk_factors,
        bp_systolic, bp_diastolic, sugar_level,
        on_medication, referral_needed, remarks
      )
      VALUES (
        $1,$2,$3,
        $4,
        $5,$6,$7,
        $8,$9,$10,
        $11,$12,$13
      )
      RETURNING *`,
      [
        survey_id,
        patient_id,
        ashaId,
        visit_date,
        existing_conditions,
        symptoms,
        risk_factors,
        bp_systolic,
        bp_diastolic,
        sugar_level,
        on_medication,
        referral_needed,
        remarks
      ]
    );

    res.status(201).json({
      message: "General screening survey saved successfully",
      data: result.rows[0],
    });

  } catch (err) {
    console.error("Error saving general screening survey:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   2️⃣ GET ALL GENERAL SCREENING SURVEYS FOR A PATIENT
============================================================== */
anc.get("/patient/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const { id } = req.params;

    const rows = await pg.query(
      `SELECT g.*,
              aw.asha_name,
              sp.supervisor_name
       FROM general_screening_surveys g
       LEFT JOIN asha_workers aw ON g.asha_id = aw.asha_id
       LEFT JOIN asha_supervisors sp ON aw.supervisor_id = sp.supervisor_id
       WHERE g.patient_id = $1
       ORDER BY g.created_at DESC`,
      [id]
    );

    res.json({
      patient_id: id,
      screenings: rows.rows.map(row => ({
        ...row,
        handled_by_asha: {
          asha_id: row.asha_id,
          asha_name: row.asha_name
        },
        supervisor: {
          supervisor_id: row.supervisor_id,
          supervisor_name: row.supervisor_name
        }
      }))
    });

  } catch (err) {
    console.error("Error fetching general screenings:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});