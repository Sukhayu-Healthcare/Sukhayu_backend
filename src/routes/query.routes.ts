import express from "express";
import { getPgClient } from "../config/postgress.js";  // your DB connection function

const router = express.Router();

router.post("/patient", async (req, res) => {
    const pg = getPgClient();
    
    try {
        const {
            patient_id,
            asha_id,          // optional
            text,
            voice_url,        // can be null if not sending voice
            disease,
            doc,
            doc_id,           // optional
            query_status,     // e.g. 'Pending'
        } = req.body;

        if (!patient_id || !text || !disease || !doc || !query_status) {
            return res.status(400).json({
                error: "patient_id, text, disease, doc, query_status are required"
            });
        }

        const insertQuery = `
            INSERT INTO queries 
            (patient_id, asha_id, text, voice_url, disease, doc, doc_id, query_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING query_id, patient_id, asha_id, voice_url, query_status;
        `;

        const values = [
            patient_id,
            asha_id || null,
            text,
            voice_url || null,
            disease,
            doc,
            doc_id || null,
            query_status
        ];

        const result = await pg.query(insertQuery, values);

        return res.status(201).json({
            message: "Query created successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Query creation error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
