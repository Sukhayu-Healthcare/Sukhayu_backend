import express, { type Request, type Response } from "express";
import { verifyToken } from "../utils/middleware.js";
import { getPgClient } from "../config/postgress.js";

const noti = express.Router();

/**
 * GOVT creates new notice
 * User must be logged in and have role = 'LHV' or 'GOVT'
 */
noti.post("/create-notice", verifyToken, async (req, res) => {
  try {
    const senderId = (req as any).user;
    const { receiver_id, receiver_role, title, body } = req.body;
    console.log("Create notice request body:", req.body);
    const pg = getPgClient();

    await pg.query(
      `INSERT INTO notifications (sender_id, receiver_id, receiver_role, title, body)
     VALUES ($1, $2, $3, $4, $5)`,
      [senderId, receiver_id, receiver_role, title, body]
    );

    res.json({ message: "Notice created" });
  } catch (error) {
    console.error("Error creating notice:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

noti.post("/forward/lhv-to-supervisors", verifyToken, async (req, res) => {
  try {
    const pg = getPgClient();
  const lhvId = (req as any).user;  
  const { title, body } = req.body;

  const supervisors = await pg.query(
    "SELECT supervisor_id FROM lhv_supervisors WHERE lhv_id=$1",
    [lhvId]
  );

  for (const row of supervisors.rows) {
    await pg.query(
      `INSERT INTO notifications
       (sender_id, receiver_id, receiver_role, title, body, forwarded_by)
       VALUES ($1, $2, 'supervisor', $3, $4, $1)`,
      [lhvId, row.supervisor_id, title, body]
    );
  }

  res.json({ message: "Forwarded to supervisors" });
}catch (error) {
    console.error("Error forwarding notice:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} );

noti.get("/notifications", verifyToken, async (req, res) => {
  try{const userId = (req as any).user;
  const pg = getPgClient();
  console.log("Fetching notifications for user:", userId);
  const result = await pg.query(
    `SELECT *
     FROM notifications 
     WHERE receiver_id=$1 AND is_read=false
     ORDER BY created_at DESC`,
    [userId]
  );

  res.json(result.rows);
}catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

noti.post("/notifications/read/:id", verifyToken, async (req, res) => {
 try {
  const pg = getPgClient();
  console.log("Marking notification as read:", req.params.id);  
  await pg.query(
    "UPDATE notifications SET is_read=true WHERE id=$1",
    [req.params.id]
  );
  res.json({ message: "Marked as read" });
}catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Internal server error" });
  
}});

noti.post("/forward/supervisor-to-asha", verifyToken, async (req, res) => {
  try{
  const UserId = (req as any).user;   // from JWT
  const { title, body } = req.body;
  const pg = getPgClient();
  console.log("Forwarding notice from supervisor to ASHA workers:", req.body);

  const supervisorUserId = await pg.query("SELECT user_id FROM asha_workers WHERE supervisor_id = (SELECT asha_id FROM asha_workers WHERE user_id = $1)", [UserId]);

  // Find all asha_workers rows where supervisor_id = this supervisor's asha_id
  const result = await pg.query(
    `SELECT asha.user_id AS asha_user_id
       FROM asha_workers AS asha
       WHERE asha.supervisor_id = (
         SELECT aw.asha_id
         FROM asha_workers aw
         WHERE aw.user_id = $1
       )`,
    [supervisorUserId]
  );

  const rows = result.rows;
  if (rows.length === 0) {
    return res.status(404).json({ message: "No ASHA workers assigned to this supervisor" });
  }

  // Insert notification for each ASHA (by their user_id)
  for (const { asha_user_id } of rows) {
    await pg.query(
      `INSERT INTO notifications (sender_user_id, receiver_user_id, title, body)
       VALUES ($1, $2, $3, $4)`,
      [supervisorUserId, asha_user_id, title, body]
    );
  }

  res.json({ message: "Notification forwarded to all ASHA workers", count: rows.length });
}catch (error) {
    console.error("Error forwarding notice to ASHA workers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

noti.post("/forward/asha-to-patients", verifyToken, async (req, res) => {
  const UserId = (req as any).user;   // ASHA’s user_id from JWT
  const { title, body } = req.body;
  const pg = getPgClient();


  // Find the asha_workers.asha_id for this user
  const aw = await pg.query(
    `SELECT asha_id FROM asha_workers WHERE user_id = $1`,
    [UserId]
  );
  if (aw.rows.length === 0) {
    return res.status(400).json({ message: "User is not registered as ASHA" });
  }
  const ashaId = aw.rows[0].asha_id;

  // Find all patients assigned to this ASHA
  const patients = await pg.query(
    `SELECT p.user_id AS patient_user_id
       FROM patient p
       WHERE p.registered_asha_id = $1
         AND p.user_id IS NOT NULL`,
    [ashaId]
  );

  if (patients.rows.length === 0) {
    return res.status(404).json({ message: "No patients assigned to this ASHA" });
  }

  // Insert notification for each patient user_id
  for (const { patient_user_id } of patients.rows) {
    await pg.query(
      `INSERT INTO notifications (sender_user_id, receiver_user_id, title, body)
       VALUES ($1, $2, $3, $4)`,
      [ashaId, patient_user_id, title, body]
    );
  }

  res.json({ message: "Notification forwarded to all patients", count: patients.rows.length });
});




export default noti;
