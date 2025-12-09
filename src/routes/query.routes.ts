import express from "express";
import { getPgClient } from "../config/postgress.js";  // your DB connection function
import { verifyToken } from "../utils/middleware.js";

const router = express.Router();

router.post("/patient", verifyToken , async (req, res) => {
    try {
        const patient_id = (req as any).user;
    const pg = getPgClient();
    
        const {
            asha_id,          // optional
            text,
            voice_url,        // can be null if not sending voice
            disease,
            doc,
            doc_id,           // optional
            query_status,     // e.g. 'Pending'
        } = req.body;
        console.log("Received query creation request:", req.body);
        
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

router.get("/doctor/:doc_id", async (req, res) => {
    const pg = getPgClient();

    try {
        const { doc_id } = req.params;

        // 1. Fetch doctor info
        const doctorResult = await pg.query(
            `SELECT doc_id, doc_name, doc_role 
             FROM doctors 
             WHERE doc_id = $1`,
            [doc_id]
        );

        if (doctorResult.rows.length === 0) {
            return res.status(404).json({ error: "Doctor not found" });
        }

        const doctor = doctorResult.rows[0];
        const docRole = doctor.doc_role;

        // 2. Fetch pending query for this doctor's role
        const pendingResult = await pg.query(
            `SELECT * FROM queries
             WHERE query_status = 'Pending'
               AND doc = $1
             ORDER BY query_id ASC
             LIMIT 1`,
            [docRole]
        );

        if (pendingResult.rows.length === 0) {
            return res.status(200).json({
                message: "No pending queries for your role",
                query: null
            });
        }

        const queryData = pendingResult.rows[0];

        // 3. Assign the query to this doctor + mark In Progress
        await pg.query(
            `UPDATE queries 
             SET query_status = 'In Progress', doc_id = $2
             WHERE query_id = $1`,
            [queryData.query_id, doc_id]
        );

        // 4. Return the query and doctor details
        return res.status(200).json({
            message: "Query assigned successfully",
            doctor,
            query: queryData
        });

    } catch (err) {
        console.error("Doctor GET error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
