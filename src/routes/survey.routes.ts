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
