
CREATE TABLE consultations (
  consultation_id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
  doctor_id INT NOT NULL REFERENCES doctors(doc_id) ON DELETE CASCADE,
  diagnosis TEXT,
  notes TEXT,
  consultation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescription_items (
  item_id SERIAL PRIMARY KEY,
  consultation_id INT NOT NULL REFERENCES consultations(consultation_id) ON DELETE CASCADE,
  medicine_name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100),
  frequency VARCHAR(100),
  duration VARCHAR(100),
  instructions TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_consultations_patient_id ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_doctor_id ON consultations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_consultation_id ON prescription_items(consultation_id);
