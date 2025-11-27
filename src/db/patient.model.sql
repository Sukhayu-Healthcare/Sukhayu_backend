CREATE TABLE patient (
    patient_id SERIAL PRIMARY KEY,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    dob DATE,
    phone BIGINT UNIQUE NOT NULL CHECK (phone BETWEEN 6000000000 AND 9999999999),
    
    -- Self reference (optional: like family head)
    supreme_id INT, 
    
    profile_pic VARCHAR(500),
    village VARCHAR(100) NOT NULL,
    taluka VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    history TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_supreme_patient
        FOREIGN KEY (supreme_id)
        REFERENCES patient(patient_id)
        ON DELETE SET NULL
);

ALTER TABLE patient
ADD COLUMN registered_asha_id INT;

ALTER TABLE patient
ADD CONSTRAINT fk_registered_asha
    FOREIGN KEY (registered_asha_id)
    REFERENCES asha_workers(asha_id)
    ON DELETE SET NULL;

    ALTER TABLE patient
ADD COLUMN user_id INT;

ALTER TABLE patient
ADD CONSTRAINT fk_patient_user
    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON DELETE CASCADE;
