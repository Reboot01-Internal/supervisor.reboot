package db

import (
	"database/sql"
	"os"

	"taskflow/internal/auth"
)

func SeedAdmin(conn *sql.DB) error {
	// if any admin exists, skip
	var count int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM users WHERE role='admin'`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := auth.HashPassword("Admin123!")
	if err != nil {
		return err
	}

	_, err = conn.Exec(`
		INSERT INTO users (full_name, email, password_hash, role)
		VALUES (?, ?, ?, 'admin')
	`, "System Admin", "admin@local.test", hash)

	// ensure data folder exists if path points there
	_ = os.MkdirAll("./data", 0755)

	return err
}