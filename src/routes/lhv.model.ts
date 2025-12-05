import express from "express";
import argon2 from "argon2";
import { getPgClient } from "../config/postgress.js";
import { getToken, verifyToken } from "../utils/middleware.js";
import { sendFCM } from "./notification/fcm.js";

const lhv = express.Router();

// LHV REGISTER
lhv.post("/register", async (req, res) => {
  try {
    const pg = getPgClient();
    const {
      user_name,
      user_password,
      phone,
      phc_name,
      village,
      district,
      taluka,
      supervisor_name,
    } = req.body;

    if (
      !user_name ||
      !user_password ||
      !phone ||
      !village ||
      !district ||
      !taluka
    ) {
      return res.status(400).json({ message: "Required fields are missing" });
    }

    // Check if phone exists
    const exists = await pg.query(
      "SELECT user_id FROM users WHERE phone = $1",
      [phone]
    );
    //@ts-ignore
    if (exists.rowCount > 0) {
      return res.status(400).json({ message: "Phone already registered" });
    }

    // Hash password
    const hashedPassword = await argon2.hash(user_password);

    // Create User (Role = LHV)
    const userInsert = await pg.query(
      `INSERT INTO users (user_name, user_password, phone, user_role)
       VALUES ($1, $2, $3, 'LHV')
       RETURNING user_id, user_name, phone, user_role, created_at`,
      [user_name, hashedPassword, phone]
    );

    const userId = userInsert.rows[0].user_id;

    // Insert into lhv_details
    const lhvInsert = await pg.query(
      `INSERT INTO lhv_details (user_id, phc_name, village, district, taluka, supervisor_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, phc_name, village, district, taluka, supervisor_name]
    );

    res.status(201).json({
      message: "LHV registered successfully",
      user: userInsert.rows[0],
      lhv_details: lhvInsert.rows[0],
    });
  } catch (err) {
    console.error("LHV Register Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

lhv.post("/login", async (req, res) => {
    try {
      const { phone, user_password } = req.body;

      const pg = getPgClient();
  
      if (!phone || !user_password) {
        return res.status(400).json({ message: "Phone and password required" });
      }
  
      // Find user
      const result = await pg.query(
        "SELECT * FROM users WHERE phone = $1",
        [phone]
      );
  
      if (result.rowCount === 0) {
        return res.status(401).json({ message: "Invalid phone or password" });
      }
  
      const user = result.rows[0];
  
      if (user.user_role !== "LHV") {
        return res.status(403).json({ message: "Not an LHV user" });
      }
  
      // Compare password
      const isMatch = await argon2.verify(user.user_password, user_password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid phone or password" });
      }
  
      // Fetch LHV Details
      const lhv = await pg.query(
        "SELECT * FROM lhv_details WHERE user_id = $1",
        [user.user_id]
      );
  
      // Create JWT token
      const token = getToken(user.user_id)
       
      res.json({
        message: "Login successful",
        token,
        user: {
          user_id: user.user_id,
          user_name: user.user_name,
          phone: user.phone,
          user_role: user.user_role
        },
        lhv_details: lhv.rows[0]
      });
  
    } catch (err) {
      console.error("LHV Login Error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  lhv.post("/send-to-supervisor",verifyToken, async (req, res) => {
    const { notice_id } = req.body;
    const lhv_user_id = (req as any).user; // from JWT
    const pool = getPgClient();
  
    try {
      // 1. Get village of LHV
      const lhvRes = await pool.query(
        "SELECT village FROM lhv_details WHERE user_id = $1",
        [lhv_user_id]
      );
      const village = lhvRes.rows[0].village;
  
      // 2. Get supervisors in same village
      const supRes = await pool.query(
        `SELECT u.user_id, u.user_name
         FROM users u
         JOIN supervisor_details s ON u.user_id = s.user_id
         WHERE s.village = $1 AND u.user_role = 'SUPERVISOR'`,
        [village]
      );
  
      if (supRes.rows.length === 0)
        return res.json({ success: false, message: "No supervisors found in village" });
  
      const supervisors = supRes.rows;
  
      // 3. Send notifications
      for (let s of supervisors) {
        const tokenRes = await pool.query(
          "SELECT fcm_token FROM device_tokens WHERE user_id = $1",
          [s.user_id]
        );
  
        if (tokenRes.rows.length === 0) continue;
  
        const token = tokenRes.rows[0].fcm_token;
  
        // 4. Insert notification record
        await pool.query(
          `INSERT INTO notifications (notice_id, receiver_user_id, fcm_token)
           VALUES ($1, $2, $3)`,
          [notice_id, s.user_id, token]
        );
  
        // 5. Send FCM
        const noticeInfo = await pool.query(
          "SELECT title, body FROM notices WHERE notice_id = $1",
          [notice_id]
        );
  
        await sendFCM(token, noticeInfo.rows[0].title, noticeInfo.rows[0].body);
      }
  
      res.json({
        success: true,
        message: "Notification sent to all supervisors!"
      });
  
    } catch (err) {
      console.log(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

export default lhv;
