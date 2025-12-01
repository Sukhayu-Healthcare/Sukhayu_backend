import express from "express";
import type { Request, Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const doctor = express.Router();

/* ============================================================
   1️⃣ DOCTOR LOGIN
============================================================ */
doctor.post("/login", async (req: Request, res: Response) => {
  try {
    const { doc_id, doc_phone, password } = req.body;

    if ((!doc_id && !doc_phone) || !password) {
      return res.status(400).json({
        message: "Provide Doctor ID or Phone with Password",
      });
    }

    const pg = getPgClient();

    const result = await pg.query(
      `SELECT * FROM doctors WHERE doc_id = $1 OR doc_phone = $2`,
      [doc_id ?? null, doc_phone ?? null]
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
      doctor: doctorRow,
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   2️⃣ GET PATIENT QUEUE
============================================================ */
doctor.get("/queue", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user.userId;

    const result = await pg.query(
      `SELECT q.queue_id, q.patient_id, q.priority, q.tagged_emergency,
              q.in_time, p.name, p.gender, p.age, p.symptoms
       FROM patient_queue q
       JOIN patients p ON p.patient_id = q.patient_id
       WHERE q.doc_id = $1 AND q.status = 'WAITING'
       ORDER BY 
          CASE 
            WHEN q.tagged_emergency = true THEN 0
            WHEN q.priority = 'RED' THEN 1
            WHEN q.priority = 'ORANGE' THEN 2
            ELSE 3
          END,
          q.in_time ASC`,
      [doctorId]
    );

    res.json({
      queue_count: result.rows.length,
      patients: result.rows,
    });

  } catch (err) {
    console.error("Queue error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   3️⃣ ADD PATIENT TO QUEUE
============================================================ */
doctor.post("/queue/add", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user.userId;

    const { patient_id, priority } = req.body;

    const result = await pg.query(
      `INSERT INTO patient_queue (patient_id, doc_id, priority, status)
       VALUES ($1, $2, $3, 'WAITING')
       RETURNING *`,
      [patient_id, doctorId, priority ?? "YELLOW"]
    );

    res.status(201).json({
      message: "Patient added to queue",
      queue: result.rows[0],
    });

  } catch (err) {
    console.error("Add queue error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   4️⃣ TAG PATIENT AS EMERGENCY
============================================================ */
doctor.put("/queue/emergency/:queue_id", verifyToken, async (req, res) => {
  try {
    const pg = getPgClient();
    const { queue_id } = req.params;

    await pg.query(
      `UPDATE patient_queue 
       SET tagged_emergency = TRUE, priority='RED'
       WHERE queue_id = $1`,
      [queue_id]
    );

    res.json({ message: "Patient tagged as emergency" });

  } catch (err) {
    console.error("Emergency tag error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   5️⃣ QUEUE STATS
============================================================ */
doctor.get("/queue/stats", verifyToken, async (req, res) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user.userId;

    const queue = await pg.query(
      `SELECT priority, in_time 
       FROM patient_queue 
       WHERE doc_id=$1 AND status='WAITING'`,
      [doctorId]
    );

    const orangeCases = queue.rows.filter(x => x.priority === "ORANGE").length;

    const avgWaitMin =
      queue.rows.length
        ? Math.round(
            queue.rows.reduce((acc, row) =>
              acc + ((Date.now() - new Date(row.in_time).getTime()) / 60000)
            , 0) / queue.rows.length
          )
        : 0;

    res.json({
      queue_count: queue.rows.length,
      orange_cases: orangeCases,
      avg_wait_time: avgWaitMin + " min",
    });

  } catch (err) {
    console.error("Queue stats error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   6️⃣ CONSULTATION WITH ITEMS + REMOVE FROM QUEUE
============================================================ */
doctor.post("/consultation-with-items", verifyToken, async (req: Request, res: Response) => {
  const pg = getPgClient();
  const doctorId = (req as any).user.userId;

  const { patient_id, diagnosis, notes, items } = req.body;

  try {
    await pg.query("BEGIN");

    // Mark doctor busy
    await pg.query(`UPDATE doctors SET doc_status='ON' WHERE doc_id=$1`, [doctorId]);

    // Remove from queue
    await pg.query(
      `UPDATE patient_queue SET status='IN_CONSULTATION'
       WHERE patient_id=$1 AND doc_id=$2 AND status='WAITING'`,
      [patient_id, doctorId]
    );

    // Create consultation
    const consultRes = await pg.query(
      `INSERT INTO consultations (patient_id, doc_id, diagnosis, notes)
       VALUES ($1,$2,$3,$4)
       RETURNING consultation_id, consultation_date`,
      [patient_id, doctorId, diagnosis ?? null, notes ?? null]
    );

    const consultation_id = consultRes.rows[0].consultation_id;

    // Save medicines
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
        VALUES ${rows.join(",")}`,
        values
      );
    }

    // Mark doctor available again
    await pg.query(`UPDATE doctors SET doc_status='OFF' WHERE doc_id=$1`, [doctorId]);

    await pg.query("COMMIT");

    res.status(201).json({
      message: "Consultation completed",
      consultation_id,
      consultation_date: consultRes.rows[0].consultation_date,
    });

  } catch (error) {
    await pg.query("ROLLBACK");
    await pg.query(`UPDATE doctors SET doc_status='OFF' WHERE doc_id=$1`, [doctorId]);

    console.error("Consultation error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   7️⃣ GET DOCTOR'S CONSULTATION HISTORY
============================================================ */
doctor.get("/consultations", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user.userId;

    const result = await pg.query(
      `SELECT * FROM consultations WHERE doc_id=$1 ORDER BY consultation_date DESC`,
      [doctorId]
    );

    res.json({
      total: result.rows.length,
      consultations: result.rows,
    });

  } catch (error) {
    console.error("Consultation history error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
