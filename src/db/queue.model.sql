CREATE TABLE patient_queue (
    queue_id SERIAL PRIMARY KEY,

    patient_id INT NOT NULL,
    doc_id INT NOT NULL,

    priority VARCHAR(10) NOT NULL DEFAULT 'YELLOW'
        CHECK (priority IN ('RED', 'ORANGE', 'YELLOW')),

    tagged_emergency BOOLEAN DEFAULT FALSE,

    status VARCHAR(20) NOT NULL DEFAULT 'WAITING'
        CHECK (status IN ('WAITING', 'IN_CONSULTATION', 'COMPLETED')),

    skipped_count INT DEFAULT 0,

    in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (doc_id) REFERENCES doctors(doc_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);
