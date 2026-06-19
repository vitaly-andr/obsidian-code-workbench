-- User roles report
CREATE TABLE users (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (id, name, role) VALUES
    (1, 'Ada', 'admin'),
    (2, 'Bob', 'viewer');

SELECT role, COUNT(*) AS total
FROM users
WHERE created_at >= '2024-01-01'
GROUP BY role
HAVING COUNT(*) > 0
ORDER BY total DESC;
