import express, { type Request, type Response } from "express";
import { verifyToken } from "../utils/middleware.js";
import { getPgClient } from "../config/postgress.js";

const noti = express.Router();

/**
 * GOVT creates new notice
 * User must be logged in and have role = 'LHV' or 'GOVT'
 */
noti.post("/create-notice", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user; // from JWT
    const { title, body } = req.body;
    const pg = getPgClient();

    // Validate body payload
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required"
      });
    }

    // Insert into DB
    const result = await pg.query(
      `INSERT INTO notices (title, body, created_by)
       VALUES ($1, $2, $3) 
       RETURNING notice_id, title, body, created_by, created_at`,
      [title, body, userId]
    );

    return res.json({
      success: true,
      message: "Notice created successfully",
      notice: result.rows[0]
    });

  } catch (err) {
    console.error("Error creating notice:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
});

noti.post("/save-token", verifyToken, async (req, res) => {
    const userId = (req as any).user;     // from JWT middleware
    const { fcm_token } = req.body;
    const pool = getPgClient();
    console.log("Saving token for user:", userId, "Token:", fcm_token);
  
    if (!fcm_token) {
      return res.status(400).json({ message: "FCM token is required" });
    }
  
    try {
      const result = await pool.query(
        `
          INSERT INTO device_tokens (user_id, fcm_token)
          VALUES ($1, $2)
          ON CONFLICT (fcm_token)
          DO UPDATE SET 
            user_id = EXCLUDED.user_id,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *;
        `,
        [userId, fcm_token]
      );
  
      res.json({
        success: true,
        message: "Token saved/updated successfully!",
        token: result.rows[0],
      });
    } catch (err) {
      console.error("Error saving token:", err);
      res.status(500).json({ message: "Database error" });
    }
  });


export default noti;
