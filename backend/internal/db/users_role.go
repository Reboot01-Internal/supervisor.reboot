package db


func GetUserRole(conn DBTX, userID int64) (string, error) {
	var role string
	err := conn.QueryRow(`SELECT role FROM users WHERE id = ?`, userID).Scan(&role)
	if err != nil {
		return "", err
	}
	return role, nil
}