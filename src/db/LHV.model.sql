CREATE TABLE lhv_details (
    lhv_id SERIAL PRIMARY KEY,

    -- Link to users table (must have user_role = 'LHV')
    user_id INT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Additional LHV-specific information
    phc_name VARCHAR(100),
    village VARCHAR(20) NOT NULL,
    district VARCHAR(20) NOT NULL,
    taluka VARCHAR(20) NOT NULL,
    supervisor_name VARCHAR(100),
    status BOOLEAN DEFAULT TRUE,  -- TRUE = Active, FALSE = Inactive

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);