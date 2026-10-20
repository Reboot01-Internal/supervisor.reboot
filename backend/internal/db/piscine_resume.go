package db

import "database/sql"

func EnsurePiscineResumeDates(conn *sql.DB) error {
	rows, err := conn.Query("PRAGMA table_info(piscine_report_exclusions)")
	if err != nil {
		return err
	}
	found := false
	for rows.Next() {
		var cid, required, pk int
		var name, kind string
		var fallback sql.NullString
		if err = rows.Scan(&cid, &name, &kind, &required, &fallback, &pk); err != nil {
			rows.Close()
			return err
		}
		if name == "resumed_at" {
			found = true
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if found {
		return nil
	}
	_, err = conn.Exec("ALTER TABLE piscine_report_exclusions ADD COLUMN resumed_at TEXT NOT NULL DEFAULT ''")
	return err
}
