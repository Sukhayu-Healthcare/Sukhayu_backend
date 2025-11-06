CREATE TABLE asha_workers (
    asha_ID SERIAL PRIMARY KEY,
    asha_name VARCHAR(100) NOT NULL,
    asha_password VARCHAR(255) NOT NULL,
    asha_village VARCHAR(20) NOT NULL,
    asha_phone BIGINT UNIQUE NOT NULL CHECK (asha_phone BETWEEN 6000000000 AND 9999999999),
    asha_district VARCHAR(20) NOT NULL,
    asha_taluka VARCHAR(20) NOT NULL,
    asha_profile_pic VARCHAR(500),
    asha_role VARCHAR(10) NOT NULL CHECK (asha_role IN ('ASHA', 'SUPERVISOR')),
    asha_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
)