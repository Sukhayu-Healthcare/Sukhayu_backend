CREATE TABLE asha_surveys (
    survey_id SERIAL PRIMARY KEY,
    asha_id INTEGER NOT NULL,
    supervisor_id INTEGER,
    patient_id INTEGER NOT NULL,

    survey_type VARCHAR(50) NOT NULL,   
    -- Options: 'ANC_FIRST', 'ANC_FOLLOWUP', 'CHILD_HEALTH', 'TB', 'GENERAL'

    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (asha_id) REFERENCES asha_workers(asha_id),
    FOREIGN KEY (supervisor_id) REFERENCES asha_supervisors(supervisor_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE anc_first_visit (
    anc_first_visit_id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    asha_id INTEGER NOT NULL,

    lmp_date DATE,
    edd_date DATE,
    gravida INTEGER,
    para INTEGER,
    living_children INTEGER,

    previous_complication TEXT,
    severe_bleeding BOOLEAN,
    convulsions BOOLEAN,
    high_bp_prev BOOLEAN,
    illnesses TEXT,

    anc_visit_date DATE,
    anc_place VARCHAR(200),
    delivery_place VARCHAR(200),
    danger_signs_explained BOOLEAN,
    next_visit_date DATE,

    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (survey_id) REFERENCES asha_surveys(survey_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (asha_id) REFERENCES asha_workers(asha_id)
);

CREATE TABLE anc_followup_visit (
    anc_followup_id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    asha_id INTEGER NOT NULL,

    visit_date DATE,
    visit_number INTEGER,               -- 1,2,3,4
    facility_type VARCHAR(100),
    symptoms TEXT,

    bp_recorded VARCHAR(20),
    weight NUMERIC(5,2),
    ifa_given BOOLEAN,
    calcium_given BOOLEAN,
    tt_dose VARCHAR(50),

    referral_made BOOLEAN,
    next_visit_date DATE,

    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (survey_id) REFERENCES asha_surveys(survey_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (asha_id) REFERENCES asha_workers(asha_id)
);

CREATE TABLE child_health_surveys (
    child_survey_id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    asha_id INTEGER NOT NULL,

    visit_date DATE,
    child_age INTEGER,                  -- months or years
    weight NUMERIC(5,2),
    height NUMERIC(5,2),

    symptoms TEXT,
    vaccines_given TEXT,                -- store as comma-separated or JSON

    referral_needed BOOLEAN,
    next_visit_date DATE,

    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (survey_id) REFERENCES asha_surveys(survey_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (asha_id) REFERENCES asha_workers(asha_id)
);

CREATE TABLE tb_surveys (
    tb_survey_id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    asha_id INTEGER NOT NULL,

    cough_more_than_2_weeks BOOLEAN,
    fever BOOLEAN,
    night_sweats BOOLEAN,
    weight_loss BOOLEAN,
    blood_in_sputum BOOLEAN,

    tb_contact_history BOOLEAN,
    risk_factors TEXT,

    referral_needed BOOLEAN,
    remarks TEXT,

    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (survey_id) REFERENCES asha_surveys(survey_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (asha_id) REFERENCES asha_workers(asha_id)
);

CREATE TABLE general_screening_surveys (
    screening_id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    asha_id INTEGER NOT NULL,

    visit_date DATE,

    existing_conditions TEXT,   -- diabetes, hypertension etc
    symptoms TEXT,              -- urination, thirst, weight loss
    risk_factors TEXT,          -- tobacco, alcohol

    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    sugar_level INTEGER,

    on_medication BOOLEAN,
    referral_needed BOOLEAN,
    remarks TEXT,

    created_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (survey_id) REFERENCES asha_surveys(survey_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (asha_id) REFERENCES asha_workers(asha_id)
);
