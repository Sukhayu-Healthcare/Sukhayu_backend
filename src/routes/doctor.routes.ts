import express from "express";
import type { Request, Response } from "express";
import { getPgClient } from "../config/postgress.js";
import * as argon2 from "argon2";
import { getToken, verifyToken } from "../utils/middleware.js";

export const doctor = express.Router();

/* ============================================================
   🟢 1) DOCTOR REGISTRATION
============================================================ */
doctor.post("/register", async (req: Request, res: Response) => {
  try {
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
      doc_speciality,
      doc_status,
    } = req.body;

    // Required fields validation
    if (
      !doc_name ||
      !doc_password ||
      !doc_role ||
      !hospital_address ||
      !hospital_village ||
      !hospital_taluka ||
      !hospital_district ||
      !hospital_state ||
      !doc_phone
    ) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Validate role
    const validRoles = ["CHO", "PHC", "CIVIL"];
    if (!validRoles.includes(doc_role)) {
      return res.status(400).json({ message: "Invalid doctor role" });
    }

    // Validate phone
    if (doc_phone < 6000000000 || doc_phone > 9999999999) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    const hashedPassword = await argon2.hash(doc_password);

    const query = `
      INSERT INTO doctors (
        doc_name, doc_password, doc_profile_pic, doc_role,
        hospital_address, hospital_village, hospital_taluka,
        hospital_district, hospital_state,
        doc_phone, doc_speciality, doc_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING doc_id, doc_name, doc_role, doc_phone, doc_status, doc_created_at;
    `;

    const values = [
      doc_name,
      hashedPassword,
      doc_profile_pic ?? null,
      doc_role,
      hospital_address,
      hospital_village,
      hospital_taluka,
      hospital_district,
      hospital_state,
      doc_phone,
      doc_speciality ?? null,
      doc_status ?? "OFF",
    ];

    const result = await pg.query(query, values);

    return res.status(201).json({
      message: "Doctor registered successfully",
      doctor: result.rows[0],
    });
  } catch (err: any) {
    console.error("Doctor Registration Error:", err);

    if (err.code === "23505") {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   2️⃣ DOCTOR LOGIN
============================================================ */
doctor.post("/login", async (req: Request, res: Response) => {
  try {
    const { doc_id, doc_phone, password } = req.body;

    if ((!doc_id && !doc_phone) || !password) {
      return res
        .status(400)
        .json({ message: "Provide Doctor ID/Phone and Password" });
    }

    const pg = getPgClient();

    const result = await pg.query(
      `SELECT * FROM doctors WHERE doc_id = $1 OR doc_phone = $2`,
      [doc_id ?? null, doc_phone ?? null]
    );

    if (!result.rows.length)
      return res.status(404).json({ message: "Doctor not found" });

    const doctorRow = result.rows[0];

    const validPassword = await argon2.verify(
      doctorRow.doc_password,
      password
    );

    if (!validPassword)
      return res.status(401).json({ message: "Invalid credentials" });

    const token = getToken(String(doctorRow.doc_id));

    return res.json({
      message: "Login successful",
      token,
      doctor: doctorRow,
    });
  } catch (err) {
    console.error("Doctor Login Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   3️⃣ GET QUEUE LIST
============================================================ */
doctor.get("/queue", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user;

    const result = await pg.query(
      `SELECT q.queue_id, q.patient_id, q.priority, q.tagged_emergency,
              q.in_time,
              p.name, p.gender, p.age, p.symptoms
       FROM patient_queue q
       JOIN patients p ON p.patient_id = q.patient_id
       WHERE q.doc_id = $1 AND q.status = 'WAITING'
       ORDER BY 
          CASE 
            WHEN q.tagged_emergency = TRUE THEN 0
            WHEN q.priority = 'RED' THEN 1
            WHEN q.priority = 'ORANGE' THEN 2
            ELSE 3
          END,
          q.in_time ASC`,
      [doctorId]
    );

    return res.json({
      queue_count: result.rows.length,
      patients: result.rows,
    });
  } catch (err) {
    console.error("Queue error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   4️⃣ ADD PATIENT TO QUEUE
============================================================ */
doctor.post("/queue/add", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user;
    const { patient_id, priority } = req.body;

    const result = await pg.query(
      `INSERT INTO patient_queue (patient_id, doc_id, priority, status)
       VALUES ($1, $2, $3, 'WAITING')
       RETURNING *`,
      [patient_id, doctorId, priority ?? "YELLOW"]
    );

    return res.status(201).json({
      message: "Patient added to queue",
      queue: result.rows[0],
    });
  } catch (err) {
    console.error("Add queue error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   5️⃣ TAG PATIENT AS EMERGENCY
============================================================ */
doctor.put("/queue/emergency/:queue_id", verifyToken, async (req, res) => {
  try {
    const pg = getPgClient();
    const { queue_id } = req.params;

    await pg.query(
      `UPDATE patient_queue 
       SET tagged_emergency = TRUE, priority = 'RED'
       WHERE queue_id = $1`,
      [queue_id]
    );

    return res.json({ message: "Patient tagged as emergency" });
  } catch (err) {
    console.error("Emergency tag error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   6️⃣ QUEUE STATISTICS
============================================================ */
doctor.get("/queue/stats", verifyToken, async (req, res) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user;

    const queue = await pg.query(
      `SELECT priority, in_time 
       FROM patient_queue 
       WHERE doc_id=$1 AND status='WAITING'`,
      [doctorId]
    );

    const orangeCases = queue.rows.filter((x) => x.priority === "ORANGE").length;

    const avgWaitMin = queue.rows.length
      ? Math.round(
          queue.rows.reduce(
            (acc, row) =>
              acc + (Date.now() - new Date(row.in_time).getTime()) / 60000,
            0
          ) / queue.rows.length
        )
      : 0;

    return res.json({
      queue_count: queue.rows.length,
      orange_cases: orangeCases,
      avg_wait_time: avgWaitMin + " min",
    });
  } catch (err) {
    console.error("Stats error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ============================================================
   7️⃣ CONSULTATION WITH MEDICINES
============================================================ */
doctor.post("/consultation-with-items",verifyToken,async (req: Request, res: Response) => {
    const pg = getPgClient();
    const doctorId = (req as any).user;

    const { patient_id, diagnosis, notes, items } = req.body;

    try {
      await pg.query("BEGIN");

      // Doctor busy
      await pg.query(`UPDATE doctors SET doc_status='ON' WHERE doc_id=$1`, [
        doctorId,
      ]);

      // Create consultation
      const consultRes = await pg.query(
        `INSERT INTO consultations (patient_id, doctor_id, diagnosis, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING consultation_id, consultation_date`,
        [patient_id, doctorId, diagnosis ?? null, notes ?? null]
      );

      const { consultation_id, consultation_date } = consultRes.rows[0];

      // Prescription items insert using UNNEST (safest)
      if (Array.isArray(items) && items.length > 0) {
        await pg.query(
          `
          INSERT INTO prescription_items
          (consultation_id, medicine_name, dosage, frequency, duration, instructions)
          SELECT * FROM UNNEST (
            $1::INT[],
            $2::TEXT[],
            $3::TEXT[],
            $4::TEXT[],
            $5::TEXT[],
            $6::TEXT[]
          )
        `,
          [
            items.map(() => consultation_id),
            items.map((i: any) => i.medicine_name),
            items.map((i: any) => i.dosage ?? null),
            items.map((i: any) => i.frequency ?? null),
            items.map((i: any) => i.duration ?? null),
            items.map((i: any) => i.instructions ?? null),
          ]
        );
      }

      // Doctor free
      await pg.query(`UPDATE doctors SET doc_status='OFF' WHERE doc_id=$1`, [
        doctorId,
      ]);

      await pg.query("COMMIT");

      return res.status(201).json({
        message: "Consultation completed",
        consultation_id,
        consultation_date,
      });
    } catch (error) {
      await pg.query("ROLLBACK");
      await pg.query(`UPDATE doctors SET doc_status='OFF' WHERE doc_id=$1`, [
        doctorId,
      ]);

      console.error("Consultation error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);


/* ============================================================
   8️⃣ DOCTOR CONSULTATION HISTORY
============================================================ */
doctor.get("/consultations", verifyToken, async (req: Request, res: Response) => {
  try {
    const pg = getPgClient();
    const doctorId = (req as any).user;

    console.log("Doctor ID:", doctorId);

    const result = await pg.query(
      `SELECT * FROM consultations 
       WHERE doctor_id=$1 
       ORDER BY consultation_date DESC`,
      [doctorId]
    );

    return res.json({
      total: result.rows.length,
      consultations: result.rows,
    });
  } catch (error) {
    console.error("History error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

doctor.get('/api/doctors', verifyToken ,async (req, res) => {
  try {
      const docID = (req as any).user
      const pg = getPgClient()
      const result = await pg.query('SELECT * FROM doctors WHERE doc_id = $1',[docID]);
      res.json(result.rows);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
  }
});

doctor.get('patient/:id', verifyToken ,async (req, res) => {
  try {
      const patientID = req.params.id;
      const pg = getPgClient()
      const result = await pg.query('SELECT * FROM patients WHERE patient_id = $1',[patientID]);
      console.log(result.rows);
      res.json(result.rows);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
  }
}
)
