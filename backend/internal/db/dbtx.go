package db

import "database/sql"

// DBTX lets you use *sql.DB or *sql.Tx (both implement these).
type DBTX interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}