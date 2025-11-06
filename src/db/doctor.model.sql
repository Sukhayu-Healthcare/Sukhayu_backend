CREATE TABLE doctors (
    doc_id SERIAL PRIMARY KEY,
    doc_name VARCHAR(100) NOT NULL,
    doc_password VARCHAR(255) NOT NULL,
    doc_profile_pic VARCHAR(500),
    doc_role VARCHAR(10) NOT NULL CHECK (doc_role IN ('CHO', 'PHC', 'CIVIL')),
    hospital_address VARCHAR(255) NOT NULL,
    hospital_village VARCHAR(100) NOT NULL,
    hospital_taluka VARCHAR(100) NOT NULL,
    hospital_district VARCHAR(100) NOT NULL,
    hospital_state VARCHAR(100) NOT NULL,
    doc_phone BIGINT NOT NULL UNIQUE CHECK (doc_phone BETWEEN 6000000000 AND 9999999999),
    doc_speciality VARCHAR(100),
    doc_status VARCHAR(5) DEFAULT 'OFF' CHECK (doc_status IN ('ON', 'OFF')),
    doc_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)