doctor.get('/patient/:id', verifyToken, async (req, res) => {
  try {
    const patientID = req.params.id;

    const pg = getPgClient();

    const query = `
      SELECT 
        p.patient_id,
        p.gender,
        p.dob,
        p.phone,
        p.supreme_id,
        p.profile_pic,
        p.village,
        p.taluka,
        p.district,
        p.history,
        p.created_at,
        p.registered_asha_id,
        p.user_id,
        u.user_name,
        u.phone AS user_phone
      FROM patient p
      LEFT JOIN users u ON p.user_id = u.user_id
      WHERE p.patient_id = $1
    `;

    const result = await pg.query(query, [patientID]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching patient:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
