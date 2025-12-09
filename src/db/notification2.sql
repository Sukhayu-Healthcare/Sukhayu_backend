CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT,
    receiver_role TEXT NOT NULL,   -- 'admin', 'lhv', 'supervisor', 'asha', 'patient'
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    forwarded_by INT,
    created_at TIMESTAMP DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE
);
