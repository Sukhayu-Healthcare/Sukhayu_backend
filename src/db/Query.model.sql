CREATE TABLE queries (
    query_id SERIAL PRIMARY KEY,

    patient_id INT NOT NULL REFERENCES patients(patient_id),
    asha_id INT REFERENCES asha_workers(asha_id),
    
    text TEXT NOT NULL,
    voice_url TEXT,  -- store S3 URL (text is safer for long URLs)

    disease VARCHAR(100) NOT NULL,
    doc TEXT NOT NULL,
    doc_id INT REFERENCES doctors(doc_id),

    query_status VARCHAR(50) NOT NULL,   -- Pending / In Progress / Completed
    done_or_not BOOLEAN DEFAULT false
);