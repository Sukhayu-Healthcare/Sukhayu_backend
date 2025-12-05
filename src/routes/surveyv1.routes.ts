import type { Request, Response } from "express";
import { verifyToken } from "../utils/middleware.js";
import express from "express";
import { getPgClient } from "../config/postgress.js";
import { table } from "console";
export const router = express.Router();

//for posting screening data
router.post("/genral", verifyToken, async (req:Request, res:Response) => {
    const ashaID = (req as any).user; // ASHA from token
    console.log("Asha ID from token for screening:", ashaID);
    const pg = getPgClient();

    const {
        patient_id,  // <-- NEW (must be passed from client)
        screening_date,
        village,
        diabetes,
        hypertension,
        heart_disease,
        stroke,
        kidney_problem,
        other_condition,
        urination,
        thirst,
        weight_loss,
        blurred_vision,
        chest_pain,
        shortness_of_breath,
        weakness,
        family_history,
        past_history,
        tobacco,
        alcohol,
        physical_activity,
        diet,
        regular_health_check,
        current_medication,
        medication_details,
        bp_check,
        sugar_check,
        remarks
    } = req.body;

    console.log(`Received screening for patient_id: ${patient_id}`);

    if (!patient_id) {
        return res.status(400).json({ error: "patient_id is required" });
    }

    try {
        const query = `
            INSERT INTO patient_screening (
                patient_id,
                screening_date, village, diabetes, hypertension, heart_disease, stroke,
                kidney_problem, other_condition, urination, thirst, weight_loss,
                blurred_vision, chest_pain, shortness_of_breath, weakness,
                family_history, past_history, tobacco, alcohol, physical_activity,
                diet, regular_health_check, current_medication, medication_details,
                bp_check, sugar_check, remarks, asha_id
            )
            VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15,
                $16, $17, $18, $19, $20,
                $21, $22, $23, $24,
                $25, $26, $27, $28, $29
            )
            RETURNING id
        `;

        const result = await pg.query(query, [
            patient_id,
            screening_date, village, diabetes, hypertension, heart_disease, stroke,
            kidney_problem, other_condition, urination, thirst, weight_loss,
            blurred_vision, chest_pain, shortness_of_breath, weakness,
            family_history, past_history, tobacco, alcohol, physical_activity,
            diet, regular_health_check, current_medication, medication_details,
            bp_check, sugar_check, remarks, ashaID
        ]);

        return res.status(201).json({
            message: "Screening saved successfully",
            screening_id: result.rows[0].id
        });

    } catch (error) {
        console.error("Error saving screening:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});



//for getting screening data
router.get("/genral", verifyToken, async (req: Request, res: Response) => {
    const ashaID = (req as any).user;
    const pg = getPgClient();

    try {
        const query = `
            SELECT 
                ps.*,
                p.patient_id,
                p.gender,
                p.dob,
                p.phone,
                p.village AS patient_village,
                p.taluka,
                p.district
            FROM patient_screening ps
            LEFT JOIN patient p ON p.patient_id = ps.patient_id
            WHERE ps.asha_id = $1
            ORDER BY ps.screening_date DESC
        `;

        const result = await pg.query(query, [ashaID]);

        return res.status(200).json({
            screenings: result.rows
        });

    } catch (error) {
        console.error("Error fetching screenings:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});


router.post("/tb-first", verifyToken, async (req, res) => {
    const ashaID = (req as any).user; // ASHA ID from JWT token
    console.log("Asha ID for TB first screening:", ashaID);

    const pg = getPgClient();
    

    const {
        patient_id,
        patient_name,
        age,
        gender,
        mobile,
        address,
        screening_date,
        cough_2_weeks,
        cough_blood,
        fever_2_weeks,
        night_sweats,
        weight_loss,
        chest_pain,
        household_tb,
        previous_tb,
        close_contact_tb,
        hiv_positive,
        diabetes,
        tobacco_use,
        alcohol_dependence,
        sputum_collected,
        chest_xray,
        referred_to_higher_center
    } = req.body;

    try {
        await pg.query("BEGIN");

        let finalPatientId = patient_id;

        // ---------------------------------------------------
        // (A) If patient_id not provided → create patient
        // ---------------------------------------------------
        if (!finalPatientId) {
            const insertPatientQuery = `
                INSERT INTO patient (patient_name, age, gender, mobile, address)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING patient_id
            `;

            const patientResult = await pg.query(insertPatientQuery, [
                patient_name,
                age,
                gender,
                mobile,
                address
            ]);

            finalPatientId = patientResult.rows[0].patient_id;
        }

        // ---------------------------------------------------
        // (B) Insert TB screening record
        // ---------------------------------------------------
        const insertTB = `
            INSERT INTO tb_patients (
                patient_id,
                patient_name, age, gender, mobile, address,
                asha_id, screening_date,
                cough_2_weeks, cough_blood, fever_2_weeks, night_sweats,
                weight_loss, chest_pain, household_tb,
                previous_tb, close_contact_tb, hiv_positive, diabetes,
                tobacco_use, alcohol_dependence,
                sputum_collected, chest_xray, referred_to_higher_center
            )
            VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8,
                $9, $10, $11, $12,
                $13, $14, $15,
                $16, $17, $18, $19,
                $20, $21,
                $22, $23, $24
            )
            RETURNING tb_id
        `;

        const tbValues = [
            finalPatientId,
            patient_name, age, gender, mobile, address,
            ashaID, screening_date,
            cough_2_weeks, cough_blood, fever_2_weeks, night_sweats,
            weight_loss, chest_pain, household_tb,
            previous_tb, close_contact_tb, hiv_positive, diabetes,
            tobacco_use, alcohol_dependence,
            sputum_collected, chest_xray, referred_to_higher_center
        ];

        const tbResult = await pg.query(insertTB, tbValues);

        await pg.query("COMMIT");

        return res.status(201).json({
            message: "TB screening recorded successfully",
            tb_id: tbResult.rows[0].tb_id,
            patient_id: finalPatientId
        });

    } catch (error) {
        await pg.query("ROLLBACK");
        console.error("Error saving TB screening:", error);
        return res.status(500).json({ error: "Internal Server Error" });

    }
});

router.get("/tb-first", verifyToken, async (req: Request, res: Response) => {
    const ashaID = (req as any).user; // ASHA ID from JWT
    console.log("Fetching TB screenings for ASHA:", ashaID);

    const pg = getPgClient();

    try {
        const query = `
            SELECT 
                t.tb_id,
                t.patient_id,
                p.patient_name,
                p.age,
                p.gender,
                p.mobile,
                p.address,

                t.screening_date,
                t.cough_2_weeks,
                t.cough_blood,
                t.fever_2_weeks,
                t.night_sweats,
                t.weight_loss,
                t.chest_pain,
                t.household_tb,
                t.previous_tb,
                t.close_contact_tb,
                t.hiv_positive,
                t.diabetes,
                t.tobacco_use,
                t.alcohol_dependence,
                t.sputum_collected,
                t.chest_xray,
                t.referred_to_higher_center,
                t.created_at

            FROM tb_patients t
            LEFT JOIN patient p ON p.patient_id = t.patient_id
            WHERE t.asha_id = $1
            ORDER BY t.created_at DESC
        `;

        const values = [ashaID];

        const result = await pg.query(query, values);

        return res.status(200).json({
            tb_screenings: result.rows
        });

    } catch (error) {
        console.error("Error fetching TB first screenings:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/tb-followup", verifyToken, async (req, res) => {
    const ashaID = (req as any).user;
    console.log("Asha ID from token for TB follow-up:", ashaID);
    const pg = getPgClient();

    let {
        tb_id,
        visit_date,
        phase_of_treatment,
        visit_type,
        doses_missed,
        vomiting,
        jaundice,
        skin_rash,
        joint_pain,
        persistent_cough,
        fever,
        weight_this_visit,
        dot_provider,
        drug_box_checked,
        counselling_given,
        treatment_continued,
        referred_for_sideeffects,
        next_followup_date,
    } = req.body;

    console.log(`Incoming tb_id: ${tb_id}`);

    try {
        // -------------------------------
        // 1️⃣ CHECK USING REAL TB ID
        // -------------------------------
        const checkPatient = await pg.query(
            `SELECT tb_id FROM tb_patients WHERE tb_id = $1 AND asha_id = $2`,
            [tb_id, ashaID]
        );

        // If not found, try if user mistakenly sent patient_id
        if (checkPatient.rows.length === 0) {
            const reCheck = await pg.query(
                `SELECT tb_id FROM tb_patients WHERE patient_id = $1 AND asha_id = $2`,
                [tb_id, ashaID]
            );

            if (reCheck.rows.length === 0) {
                return res.status(403).json({
                    error: "You are not authorized to add follow-up for this patient",
                });
            }

            // Replace incoming wrong tb_id with correct one
            tb_id = reCheck.rows[0].tb_id;
            console.log("Corrected tb_id from patient_id →", tb_id);
        }

        // -------------------------------
        // 2️⃣ INSERT FOLLOW-UP
        // -------------------------------
        const query = `
            INSERT INTO tb_followups (
                tb_id, asha_id, visit_date, phase_of_treatment, visit_type,
                doses_missed, vomiting, jaundice, skin_rash, joint_pain,
                persistent_cough, fever, weight_this_visit,
                dot_provider, drug_box_checked, counselling_given,
                treatment_continued, referred_for_sideeffects, next_followup_date
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13,
                $14, $15, $16,
                $17, $18, $19
            )
            RETURNING followup_id
        `;

        const values = [
            tb_id, ashaID, visit_date, phase_of_treatment, visit_type,
            doses_missed, vomiting, jaundice, skin_rash, joint_pain,
            persistent_cough, fever, weight_this_visit,
            dot_provider, drug_box_checked, counselling_given,
            treatment_continued, referred_for_sideeffects, next_followup_date
        ];

        const result = await pg.query(query, values);

        return res.status(201).json({
            message: "TB follow-up added successfully",
            followup_id: result.rows[0].followup_id
        });

    } catch (error) {
        console.error("Error saving TB follow-up:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});



//for getting tb followup data
router.get("/tb/followups/:tb_id", verifyToken, async (req: Request, res: Response) => {
    const ashaID = (req as any).user; // Extracted from JWT
    const tb_id = req.params.tb_id;
    console.log("Asha ID to get TB follow-ups from token:", ashaID);
    const pg = getPgClient();

    try {
        // --- Verify that this TB patient belongs to the logged-in ASHA worker ---
        const checkPatient = await pg.query(
            `SELECT tb_id FROM tb_patients WHERE tb_id = $1 AND asha_id = $2`,
            [tb_id, ashaID]
        );

        if (checkPatient.rows.length === 0) {
            return res.status(403).json({
                error: "You are not authorized to view follow-ups for this patient"
            });
        }

        // --- Fetch follow-ups belonging to this ASHA worker only ---
        const query = `
            SELECT * FROM tb_followups
            WHERE tb_id = $1 AND asha_id = $2
            ORDER BY visit_date DESC
        `;

        const values = [tb_id, ashaID];

        const result = await pg.query(query, values);

        return res.status(200).json({
            tb_followups: result.rows
        });

    } catch (error) {
        console.error("Error fetching TB follow-ups:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/anc", verifyToken, async (req, res) => {
    try {
    const ashaID = (req as any).user;
    console.log("Asha ID from token for ANC visit:", ashaID);
    const pg = getPgClient();
    
    const {
        patient_id,
        first_anc_visit_date,
        lmp_date,
        edd,
        gravida,
        para,
        living_children,
        previous_serious_complication,
        severe_bleeding_now,
        convulsions,
        high_bp_earlier,
        illness_diabetes,
        illness_high_bp,
        illness_heart_disease,
        illness_tb,
        illness_hiv,
        illness_other,
        place_of_anc_care,
        planned_place_delivery,
        danger_signs_explained,
        next_visit_date
    } = req.body;
    console.log("done", req.body);
    
        // --- Check if pregnant woman belongs to the ASHA worker ---
        const checkWoman = await pg.query(
            `SELECT patient_id FROM patient WHERE patient_id = $1 AND registered_asha_id = $2`,
            [patient_id, ashaID]
        );

        if (checkWoman.rows.length === 0) {
            return res.status(403).json({
                error: "You are not authorized to add ANC visit for this woman"
            });
        }

        // --- Insert ANC First Visit record with asha_id ---
        const query = `
        INSERT INTO anc_first_visit (
            pregnant_woman_id, first_anc_visit_date,
            lmp_date, edd, gravida, para, living_children,
            previous_serious_complication,
            severe_bleeding_now, convulsions, high_bp_earlier,
            illness_diabetes, illness_high_bp, illness_heart_disease,
            illness_tb, illness_hiv, illness_other,
            place_of_anc_care, planned_place_delivery,
            danger_signs_explained, next_visit_date,
            asha_id, patient_id
        )
        VALUES (
            $1,
            to_date($2, 'DD/MM/YYYY'),
            to_date($3, 'DD/MM/YYYY'),
            to_date($4, 'DD/MM/YYYY'),
            $5, $6, $7,
            $8,
            $9, $10, $11,
            $12, $13, $14,
            $15, $16, $17,
            $18, $19,
            $20,
            to_date($21, 'DD/MM/YYYY'),
            $22, $23
        )
        RETURNING anc_id
    `;
    
    const values = [
        patient_id, first_anc_visit_date,
        lmp_date, edd, gravida, para, living_children,
        previous_serious_complication,
        severe_bleeding_now, convulsions, high_bp_earlier,
        illness_diabetes, illness_high_bp, illness_heart_disease,
        illness_tb, illness_hiv, illness_other,
        place_of_anc_care, planned_place_delivery,
        danger_signs_explained, next_visit_date,
        ashaID, patient_id
    ];

        const result = await pg.query(query, values);

        return res.status(201).json({
            message: "ANC first visit recorded successfully",
            anc_id: result.rows[0].anc_id
        });

    } catch (error) {
        console.error("Error saving ANC visit:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


//for getting anc first visit data
router.get('/anc', verifyToken, async (req: Request, res: Response) => {
    try {
        const pg = getPgClient();
        const asha_id = (req as any).user; // JWT provides ASHA ID

        // Optional filter – get ANC for a specific woman
        const womanId = req.query.woman_id as string | undefined;

        let query = `
            SELECT 
                a.anc_id,
                a.pregnant_woman_id,
                w.name AS woman_name,
                a.first_anc_visit_date,
                a.place_of_anc_care,
                a.planned_place_delivery,
                a.danger_signs_explained,
                a.next_visit_date,
                a.created_at
            FROM anc_first_visit a
            JOIN pregnant_women w ON a.pregnant_woman_id = w.id
            WHERE a.asha_id = $1
        `;

        const values: any[] = [asha_id];

        if (womanId) {
            query += ` AND a.pregnant_woman_id = $2`;
            values.push(womanId);
        }

        const result = await pg.query(query, values);

        return res.status(200).json({
            message: "ANC records fetched successfully",
            count: result.rows.length,
            anc_records: result.rows,
        });

    } catch (error) {
        console.error("ANC fetch error:", error);
        return res.status(500).json({ message: "Server error fetching ANC records" });
    }
});


router.post("/anc-followup", verifyToken, async (req: Request, res: Response) => {
    try {
        const asha_id = (req as any).user; // ✅ consistent with other endpoints
        const pg = getPgClient();
        console.log("Asha ID from token for ANC follow-up:", asha_id);

        const {
            patient_id,
            visit_date,
            visit_number,
            facility_type,

            symptom_vaginal_bleeding,
            symptom_severe_headache,
            symptom_swelling_face_hands,
            symptom_fever_chills,
            symptom_reduced_baby_movement,
            symptom_severe_abdominal_pain,
            symptom_none,

            bp_recorded,
            bp_value,
            weight_kg,

            ifa_tablets_given,
            calcium_tablets_given,
            tt_td_dose,

            referral_made,
            next_visit_date
        } = req.body;

        console.log(req.body);

        // Required validations
        if (!patient_id || !visit_date || !visit_number || !facility_type) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // --- Verify that the pregnant woman belongs to the logged-in ASHA ---
        const checkWoman = await pg.query(
            `SELECT patient_id FROM patient WHERE patient_id = $1 AND registered_asha_id = $2`,
            [patient_id, asha_id]
        );

        if (checkWoman.rows.length === 0) {
            return res.status(403).json({
                message: "You are not authorized to add follow-up for this woman"
            });
        }

        // --- Insert follow-up record ---
        const query = `
            INSERT INTO anc_followup_visit (
                pregnant_woman_id, asha_id, visit_date, visit_number, facility_type,
                symptom_vaginal_bleeding, symptom_severe_headache, symptom_swelling_face_hands,
                symptom_fever_chills, symptom_reduced_baby_movement, symptom_severe_abdominal_pain,
                symptom_none, bp_recorded, bp_value, weight_kg,
                ifa_tablets_given, calcium_tablets_given, tt_td_dose,
                referral_made, next_visit_date
            )
            VALUES (
                $1,$2,$3,$4,$5,
                $6,$7,$8,
                $9,$10,$11,
                $12,$13,$14,$15,
                $16,$17,$18,
                $19,$20
            )
            RETURNING *;
        `;

        const values = [
            patient_id, asha_id, visit_date, visit_number, facility_type,
            symptom_vaginal_bleeding, symptom_severe_headache, symptom_swelling_face_hands,
            symptom_fever_chills, symptom_reduced_baby_movement, symptom_severe_abdominal_pain,
            symptom_none, bp_recorded, bp_value, weight_kg,
            ifa_tablets_given, calcium_tablets_given, tt_td_dose,
            referral_made, next_visit_date
        ];

        const result = await pg.query(query, values);

        return res.status(201).json({
            message: "ANC follow-up created successfully",
            data: result.rows[0],
        });

    } catch (error: any) {
        console.error("ANC Follow-up Error:", error);
        return res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

router.get("/supervisor/data/:tableName/:date", verifyToken, async (req, res) => {
    const supervisorID = (req as any).user; // Supervisor user_id from token
    const { tableName, date } = req.params;
    const pg = getPgClient();
    console.log(`Supervisor ID: ${supervisorID}, Table: ${tableName}, Date: ${date}`);

    const allowedTables = [
        "patient_screening",
        "tb_patients",
        "tb_followups",
        "anc_first_visit",
        "anc_followup_visit"
    ];

    if (!tableName) return res.status(400).json({ error: "Table name is required" });
    if (!allowedTables.includes(tableName)) return res.status(400).json({ error: "Invalid table name" });

    // Validate date format YYYY-MM-DD
    //@ts-ignore
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    try {
        // STEP 1: Get ASHA workers under supervisor using user_id
        const ashaResult = await pg.query(
            `SELECT user_id FROM asha_workers WHERE supervisor_id = $1`,
            [supervisorID]
        );

        console.log("ASHA workers under supervisor:", ashaResult.rows);

        if (ashaResult.rows.length === 0) {
            return res.status(404).json({ message: "No ASHA workers found under this supervisor" });
        }

        const ashaUserIDs = ashaResult.rows.map(r => r.user_id);

        // STEP 2: Fetch data from requested table using ASHA user_id
        const dataQuery = `
            SELECT *
            FROM ${tableName}
            WHERE asha_id = ANY($1)
              AND DATE(created_at) = $2
            ORDER BY created_at DESC
        `;

        const dataResult = await pg.query(dataQuery, [ashaUserIDs, date]);

        return res.status(200).json({
            supervisor_id: supervisorID,
            table: tableName,
            date: date,
            asha_count: ashaUserIDs.length,
            count: dataResult.rows.length,
            records: dataResult.rows
        });

    } catch (error) {
        console.error("Supervisor fetch error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

