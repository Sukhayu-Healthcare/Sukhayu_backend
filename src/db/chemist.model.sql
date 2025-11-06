CREATE TABLE chemist(
    chemist_ID SERIAL PRIMARY KEY,
    chemist_name VARCHAR(100) NOT NULL,
    chemist_password VARCHAR(255) NOT NULL,
    chemist_profile_pic VARCHAR(500),
    chemist_phone BIGINT NOT NULL UNIQUE CHECK(chemist_phone BETWEEN 6000000000 AND 9999999999),
    chemist_gender VARCHAR(20) NOT NULL CHECK(chemist_gender IN ('MALE','FEMALE','OTHER')),
    chemist_village VARCHAR(100) NOT NULL,
    chemist_taluka VARCHAR(100) NOT NULL,
    chemist_dist VARCHAR(100) NOT NULL,
    chemist_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    chemist_license_no VARCHAR(100) NOT NULL UNIQUE
)