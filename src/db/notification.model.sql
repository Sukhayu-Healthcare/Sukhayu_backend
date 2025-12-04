CREATE TABLE device_tokens (
    token_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fcm_token)
);

CREATE TABLE notices (
    notice_id SERIAL PRIMARY KEY,
    created_by INT REFERENCES users(user_id),  -- Govt admin
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    target_village VARCHAR(50),
    target_district VARCHAR(50),
    target_taluka VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_flow (
    flow_id SERIAL PRIMARY KEY,
    notice_id INT NOT NULL REFERENCES notices(notice_id) ON DELETE CASCADE,
    from_user_id INT REFERENCES users(user_id),        -- LHV or Supervisor
    to_role VARCHAR(15) NOT NULL CHECK (to_role IN ('SUPERVISOR', 'ASHA', 'PATIENT')),
    status VARCHAR(20) DEFAULT 'pending',              -- pending, sent
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    notice_id INT NOT NULL REFERENCES notices(notice_id),
    receiver_user_id INT NOT NULL REFERENCES users(user_id),
    fcm_token TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'sent'   -- sent, delivered, failed
);

