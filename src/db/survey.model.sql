CREATE TABLE patient_screening (
    id SERIAL PRIMARY KEY,

    -- Basic Info
    screening_date DATE NOT NULL,
    village VARCHAR(100) NOT NULL,

    -- Medical Conditions (Yes / No)
    diabetes BOOLEAN,
    hypertension BOOLEAN,
    heart_disease BOOLEAN,
    stroke BOOLEAN,
    kidney_problem BOOLEAN,
    other_condition VARCHAR(255),

    -- Symptoms
    urination BOOLEAN,
    thirst BOOLEAN,
    weight_loss BOOLEAN,
    blurred_vision BOOLEAN,
    chest_pain BOOLEAN,
    shortness_of_breath BOOLEAN,
    weakness BOOLEAN,

    -- Family History
    family_history BOOLEAN,     -- e.g., Diabetes / BP
    past_history TEXT,

    -- Lifestyle
    tobacco BOOLEAN,
    alcohol BOOLEAN,
    physical_activity VARCHAR(20) CHECK (physical_activity IN ('Active', 'Moderate', 'Less')),
    diet BOOLEAN,

    -- Health Check
    regular_health_check BOOLEAN,
    current_medication BOOLEAN,
    medication_details TEXT,

    -- Vital Checks
    bp_check TEXT,
    sugar_check TEXT,

    -- Additional
    remarks TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_patients (
    tb_id SERIAL PRIMARY KEY,

    -- Identification
    patient_name VARCHAR(100) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('Male','Female','Other')),
    mobile BIGINT NOT NULL CHECK (mobile BETWEEN 6000000000 AND 9999999999),
    address VARCHAR(255) NOT NULL,
    asha_id INT NOT NULL,
    screening_date DATE NOT NULL,

    -- Symptom Screening (Yes/No)
    cough_2_weeks BOOLEAN,
    cough_blood BOOLEAN,
    fever_2_weeks BOOLEAN,
    night_sweats BOOLEAN,
    weight_loss BOOLEAN,
    chest_pain BOOLEAN,
    household_tb BOOLEAN,

    -- Risk factors
    previous_tb BOOLEAN,
    close_contact_tb BOOLEAN,
    hiv_positive BOOLEAN,
    diabetes BOOLEAN,
    tobacco_use BOOLEAN,
    alcohol_dependence BOOLEAN,

    -- Initial Action
    sputum_collected BOOLEAN,
    chest_xray BOOLEAN,
    referred_to_higher_center BOOLEAN,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_followups (
    followup_id SERIAL PRIMARY KEY,
    tb_id INT NOT NULL REFERENCES tb_patients(tb_id) ON DELETE CASCADE,

    visit_date DATE NOT NULL,
    phase_of_treatment VARCHAR(50) NOT NULL CHECK (phase_of_treatment IN ('Intensive','Continuation')),
    visit_type VARCHAR(50) NOT NULL CHECK (visit_type IN ('Home visit','Facility visit')),

    -- Adherence & Symptoms
    doses_missed INT DEFAULT 0,
    vomiting BOOLEAN,
    jaundice BOOLEAN,
    skin_rash BOOLEAN,
    joint_pain BOOLEAN,
    persistent_cough BOOLEAN,
    fever BOOLEAN,
    weight_this_visit NUMERIC(5,2),

    -- Programmatic details
    dot_provider VARCHAR(100) NOT NULL,
    drug_box_checked BOOLEAN,
    counselling_given BOOLEAN,

    -- Decision / Action
    treatment_continued BOOLEAN,
    referred_for_sideeffects BOOLEAN,
    next_followup_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE anc_first_visit (
    anc_id SERIAL PRIMARY KEY,
    pregnant_woman_id INT NOT NULL REFERENCES pregnant_women(id),

    -- ANC Visit
    first_anc_visit_date DATE NOT NULL,

    -- Pregnancy Basics
    lmp_date DATE,                          -- Added
    edd DATE,                               -- Added
    gravida INT DEFAULT 0,                  -- Added
    para INT DEFAULT 0,                     -- Added
    living_children INT DEFAULT 0,          -- Added

    -- Previous Pregnancy History
    previous_serious_complication BOOLEAN DEFAULT FALSE,

    -- Current Risk Screening
    severe_bleeding_now BOOLEAN DEFAULT FALSE,
    convulsions BOOLEAN DEFAULT FALSE,
    high_bp_earlier BOOLEAN DEFAULT FALSE,

    -- Known Serious Illness (Multiple selection)
    illness_diabetes BOOLEAN DEFAULT FALSE,
    illness_high_bp BOOLEAN DEFAULT FALSE,
    illness_heart_disease BOOLEAN DEFAULT FALSE,
    illness_tb BOOLEAN DEFAULT FALSE,
    illness_hiv BOOLEAN DEFAULT FALSE,
    illness_other BOOLEAN DEFAULT FALSE,

    -- ANC & Delivery Plan
    place_of_anc_care VARCHAR(20) NOT NULL 
        CHECK (place_of_anc_care IN ('Govt', 'Private', 'Not decided')),

    planned_place_delivery VARCHAR(20) NOT NULL 
        CHECK (planned_place_delivery IN ('Govt', 'Private', 'Home', 'Not decided')),

    -- Counselling
    danger_signs_explained BOOLEAN DEFAULT FALSE,

    next_visit_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE anc_followup_visit (
    followup_id SERIAL PRIMARY KEY,
    pregnant_woman_id INT NOT NULL REFERENCES pregnant_women(id),

    -- Visit Details
    visit_date DATE NOT NULL,
    visit_number INT NOT NULL,                -- e.g., 2, 3, 4, ...

    facility_type VARCHAR(20) NOT NULL
        CHECK (facility_type IN ('Govt facility', 'Private', 'Home visit')),

    -- Current Condition Symptoms (Multiple selection)
    symptom_vaginal_bleeding BOOLEAN DEFAULT FALSE,
    symptom_severe_headache BOOLEAN DEFAULT FALSE,
    symptom_swelling_face_hands BOOLEAN DEFAULT FALSE,
    symptom_fever_chills BOOLEAN DEFAULT FALSE,
    symptom_reduced_baby_movement BOOLEAN DEFAULT FALSE,
    symptom_severe_abdominal_pain BOOLEAN DEFAULT FALSE,
    symptom_none BOOLEAN DEFAULT FALSE,       -- "None of the above"

    -- BP & Weight
    bp_recorded BOOLEAN DEFAULT FALSE,
    bp_value INT 
    weight_kg NUMERIC(5,2),

    -- Interventions
    ifa_tablets_given INT DEFAULT 0,
    calcium_tablets_given INT DEFAULT 0,

    tt_td_dose VARCHAR(10) DEFAULT 'None'
        CHECK (tt_td_dose IN ('None', 'TT1', 'TT2', 'TT Booster', 'TD1', 'TD2')),

    -- Referral
    referral_made BOOLEAN DEFAULT FALSE,

    -- Next Visit
    next_visit_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
