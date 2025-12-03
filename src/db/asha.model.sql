CREATE TABLE asha_workers (
    asha_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    village VARCHAR(20) NOT NULL,
    district VARCHAR(20) NOT NULL,
    taluka VARCHAR(20) NOT NULL,
    profile_pic VARCHAR(500),
    supervisor_id INT,
    
    CONSTRAINT fk_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_supervisor
        FOREIGN KEY (supervisor_id)
        REFERENCES asha_workers(asha_id)
);

ALTER TABLE asha_workers 
ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'inactive'));
