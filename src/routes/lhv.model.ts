import express from "express";
import argon2 from "argon2";
import { getPgClient } from "../config/postgress.js";
import { getToken } from "../utils/middleware.js";

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

export default lhv;
