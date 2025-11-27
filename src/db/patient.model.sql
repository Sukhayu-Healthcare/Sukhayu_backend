CREATE TABLE patient (
    patient_id SERIAL PRIMARY KEY,
    patient_name VARCHAR(100) NOT NULL,
    patient_password VARCHAR(255) NOT NULL,
    patient_gender VARCHAR(10) NOT NULL CHECK (patient_gender IN ('MALE', 'FEMALE', 'OTHER')),
    patient_dob DATE,
    patient_phone BIGINT NOT NULL CHECK (patient_phone BETWEEN 6000000000 AND 9999999999),
    patient_supreme_id INT, 
    patient_profile_pic VARCHAR(500),
    patient_village VARCHAR(100) NOT NULL,
    patient_taluka VARCHAR(100) NOT NULL,
    patient_dist VARCHAR(100) NOT NULL,
    patient_hist TEXT,
    patient_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_supreme_patient
        FOREIGN KEY (patient_supreme_id)
        REFERENCES patient(patient_id)
        ON DELETE SET NULL
);

ALTER TABLE patient
ADD COLUMN registered_asha_id INT;

ALTER TABLE patient
ADD CONSTRAINT fk_registered_asha
    FOREIGN KEY (registered_asha_id)
    REFERENCES asha_workers(asha_ID)
    ON DELETE SET NULL;
