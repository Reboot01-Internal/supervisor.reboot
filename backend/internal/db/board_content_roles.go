package db

import "database/sql"

// EnsureBoardContentRoles upgrades both new and existing databases, including
// a database where only one of the two columns was added before a restart.
func EnsureBoardContentRoles(conn *sql.DB) error {
	for _, table := range []string{"lists", "cards"} {
		rows, err := conn.Query("PRAGMA table_info(" + table + ")")
		if err != nil {
			return err
		}
		exists := false
		for rows.Next() {
			var cid, required, pk int
			var name, kind string
			var fallback sql.NullString
			if err = rows.Scan(&cid, &name, &kind, &required, &fallback, &pk); err != nil {
				rows.Close()
				return err
			}
			if name == "created_by_role" {
				exists = true
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if !exists {
			if _, err = conn.Exec("ALTER TABLE " + table + " ADD COLUMN created_by_role TEXT NOT NULL DEFAULT ''"); err != nil {
				return err
			}
		}
	}
	return nil
}
