package db

import (
	"database/sql"
	"errors"
	"os"
	"strings"

	"taskflow/internal/auth"

	"taskflow/internal/models"
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

func GetUserByEmail(conn *sql.DB, email string) (id int64, fullName, passHash, role string, isActive bool, err error) {
	var activeInt int
	err = conn.QueryRow(`
		SELECT id, full_name, password_hash, role, is_active
		FROM users WHERE email = ?
	`, email).Scan(&id, &fullName, &passHash, &role, &activeInt)

	if err != nil {
		return 0, "", "", "", false, err
	}
	return id, fullName, passHash, role, activeInt == 1, nil
}

func GetUserBasic(conn *sql.DB, id int64) (fullName, email, role string, isActive bool, err error) {
	var activeInt int
	err = conn.QueryRow(`
		SELECT full_name, email, role, is_active
		FROM users WHERE id = ?
	`, id).Scan(&fullName, &email, &role, &activeInt)
	if err != nil {
		return "", "", "", false, err
	}
	return fullName, email, role, activeInt == 1, nil
}

func CreateUser(conn *sql.DB, fullName, email, passHash, role string) (int64, error) {
	res, err := conn.Exec(`
		INSERT INTO users (full_name, email, password_hash, role)
		VALUES (?, ?, ?, ?)
	`, fullName, email, passHash, role)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func EnsureSupervisorFile(conn *sql.DB, supervisorUserID int64) error {
	// insert if not exists
	_, err := conn.Exec(`
		INSERT INTO supervisor_files (supervisor_user_id)
		VALUES (?)
		ON CONFLICT(supervisor_user_id) DO NOTHING
	`, supervisorUserID)
	return err
}

var ErrForbidden = errors.New("forbidden")


func GetSupervisorFileIDBySupervisorUserID(conn *sql.DB, supervisorUserID int64) (int64, error) {
	var fileID int64
	err := conn.QueryRow(`SELECT id FROM supervisor_files WHERE supervisor_user_id = ?`, supervisorUserID).Scan(&fileID)
	return fileID, err
}

func CreateBoard(conn *sql.DB, supervisorFileID int64, name, desc string, createdBy int64) (int64, error) {
	res, err := conn.Exec(`
		INSERT INTO boards (supervisor_file_id, name, description, created_by)
		VALUES (?, ?, ?, ?)
	`, supervisorFileID, name, desc, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListBoardsBySupervisorFile(conn *sql.DB, supervisorFileID int64) ([]models.Board, error) {
	rows, err := conn.Query(`
		SELECT id, supervisor_file_id, name, description, created_by, created_at
		FROM boards
		WHERE supervisor_file_id = ?
		ORDER BY created_at DESC
	`, supervisorFileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.Board{}
	for rows.Next() {
		var b models.Board
		if err := rows.Scan(&b.ID, &b.SupervisorFileID, &b.Name, &b.Description, &b.CreatedBy, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, nil
}

func AddBoardMember(conn *sql.DB, boardID, userID int64, roleInBoard string) error {
	_, err := conn.Exec(`
		INSERT INTO board_members (board_id, user_id, role_in_board)
		VALUES (?, ?, ?)
		ON CONFLICT(board_id, user_id) DO UPDATE SET role_in_board=excluded.role_in_board
	`, boardID, userID, roleInBoard)
	return err
}

func ListBoardMembers(conn *sql.DB, boardID int64) ([]models.BoardMember, error) {
	rows, err := conn.Query(`
		SELECT u.id, u.full_name, u.email, u.role, bm.role_in_board, bm.added_at
		FROM board_members bm
		JOIN users u ON u.id = bm.user_id
		WHERE bm.board_id = ?
		ORDER BY u.full_name ASC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.BoardMember{}
	for rows.Next() {
		var m models.BoardMember
		if err := rows.Scan(&m.UserID, &m.FullName, &m.Email, &m.Role, &m.RoleInBoard, &m.AddedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

func SearchUsersByRole(conn *sql.DB, role string, q string) ([]models.User, error) {
	rows, err := conn.Query(`
		SELECT id, full_name, email, role, is_active, created_at
		FROM users
		WHERE role = ? AND is_active = 1
		AND (LOWER(full_name) LIKE '%' || LOWER(?) || '%' OR LOWER(email) LIKE '%' || LOWER(?) || '%')
		ORDER BY full_name ASC
		LIMIT 25
	`, role, q, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.User{}
	for rows.Next() {
		var u models.User
		var activeInt int
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &activeInt, &u.CreatedAt); err != nil {
			return nil, err
		}
		u.IsActive = activeInt == 1
		out = append(out, u)
	}
	return out, nil
}

// Board data
func GetBoardBasic(conn *sql.DB, boardID int64) (models.Board, error) {
	var b models.Board
	err := conn.QueryRow(`
		SELECT id, supervisor_file_id, name, description, created_by, created_at
		FROM boards WHERE id = ?
	`, boardID).Scan(&b.ID, &b.SupervisorFileID, &b.Name, &b.Description, &b.CreatedBy, &b.CreatedAt)
	return b, err
}

// Lists
func CreateList(conn *sql.DB, boardID int64, title string) (int64, error) {
	var nextPos int64
	_ = conn.QueryRow(`SELECT COALESCE(MAX(position), -1) + 1 FROM lists WHERE board_id = ?`, boardID).Scan(&nextPos)

	res, err := conn.Exec(`
		INSERT INTO lists (board_id, title, position)
		VALUES (?, ?, ?)
	`, boardID, title, nextPos)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListLists(conn *sql.DB, boardID int64) ([]models.List, error) {
	rows, err := conn.Query(`
		SELECT id, board_id, title, position, created_at
		FROM lists
		WHERE board_id = ?
		ORDER BY position ASC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.List{}
	for rows.Next() {
		var l models.List
		if err := rows.Scan(&l.ID, &l.BoardID, &l.Title, &l.Position, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

// Cards
func CreateCard(conn *sql.DB, listID int64, title, description string) (int64, error) {
	var nextPos int64
	_ = conn.QueryRow(`SELECT COALESCE(MAX(position), -1) + 1 FROM cards WHERE list_id = ?`, listID).Scan(&nextPos)

	res, err := conn.Exec(`
		INSERT INTO cards (list_id, title, description, position)
		VALUES (?, ?, ?, ?)
	`, listID, title, description, nextPos)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Cards
func ListCardsByBoard(conn *sql.DB, boardID int64) ([]models.Card, error) {
	rows, err := conn.Query(`
		SELECT
			c.id,
			c.list_id,
			c.title,
			c.description,
			c.position,
			c.created_at,
			COALESCE(c.due_date, ''),
			COALESCE(c.status, 'todo'),
			COALESCE(c.priority, 'medium')
		FROM cards c
		JOIN lists l ON l.id = c.list_id
		WHERE l.board_id = ?
		ORDER BY l.position ASC, c.position ASC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.Card{}
	for rows.Next() {
		var c models.Card
		if err := rows.Scan(
			&c.ID,
			&c.ListID,
			&c.Title,
			&c.Description,
			&c.Position,
			&c.CreatedAt,
			&c.DueDate,
			&c.Status,
			&c.Priority,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

// Move card between lists + update ordering (simple + robust)
func MoveCard(conn *sql.DB, cardID, toListID int64, toPosition int64) error {
	// shift down existing cards in target list from toPosition
	_, err := conn.Exec(`
		UPDATE cards
		SET position = position + 1
		WHERE list_id = ? AND position >= ?
	`, toListID, toPosition)
	if err != nil {
		return err
	}

	// move the card
	_, err = conn.Exec(`
		UPDATE cards
		SET list_id = ?, position = ?
		WHERE id = ?
	`, toListID, toPosition, cardID)
	return err
}

// reorder within a list (array of card IDs in correct order)
func ReorderCards(conn *sql.DB, listID int64, orderedIDs []int64) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for i, id := range orderedIDs {
		_, err := tx.Exec(`UPDATE cards SET position = ? WHERE id = ? AND list_id = ?`, i, id, listID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}
func GetCard(conn *sql.DB, cardID int64) (models.Card, error) {
	var c models.Card
	err := conn.QueryRow(`
		SELECT id, list_id, title, description, position, created_at
		FROM cards
		WHERE id = ?
	`, cardID).Scan(&c.ID, &c.ListID, &c.Title, &c.Description, &c.Position, &c.CreatedAt)
	return c, err
}

func UpdateCard(conn *sql.DB, cardID int64, title, description string) error {
	_, err := conn.Exec(`
		UPDATE cards
		SET title = ?, description = ?
		WHERE id = ?
	`, title, description, cardID)
	return err
}
// ---------- Card full helpers (board id, assignees, subtasks)

func GetBoardIDByCardID(conn *sql.DB, cardID int64) (int64, error) {
	var boardID int64
	err := conn.QueryRow(`
		SELECT l.board_id
		FROM cards c
		JOIN lists l ON l.id = c.list_id
		WHERE c.id = ?
	`, cardID).Scan(&boardID)
	return boardID, err
}

func GetCardWithDue(conn *sql.DB, cardID int64) (models.Card, error) {
	var c models.Card
	var due sql.NullString
	var status sql.NullString
	var priority sql.NullString

	err := conn.QueryRow(`
		SELECT id, list_id, title, description, due_date, COALESCE(status,'todo'), COALESCE(priority,'medium'), position, created_at
		FROM cards
		WHERE id = ?
	`, cardID).Scan(&c.ID, &c.ListID, &c.Title, &c.Description, &due, &status, &priority, &c.Position, &c.CreatedAt)

	if err != nil {
		return c, err
	}
	if due.Valid {
		c.DueDate = due.String
	} else {
		c.DueDate = ""
	}
	if status.Valid && status.String != "" {
		c.Status = status.String
	} else {
		c.Status = "todo"
	}
	if priority.Valid && priority.String != "" {
		c.Priority = priority.String
	} else {
		c.Priority = "medium"
	}
	return c, nil
	 }
func UpdateCardAll(conn *sql.DB, cardID int64, title, description, dueDate, status, priority string) error {
	var due any = nil
	if strings.TrimSpace(dueDate) != "" {
		due = strings.TrimSpace(dueDate)
	}

	if strings.TrimSpace(status) == "" {
		status = "todo"
	}
	if strings.TrimSpace(priority) == "" {
		priority = "medium"
	}

	_, err := conn.Exec(`
		UPDATE cards
		SET title = ?, description = ?, due_date = ?, status = ?, priority = ?
		WHERE id = ?
	`, title, description, due, status, priority, cardID)
	return err
}

// ---------- Subtasks

func CreateSubtask(conn *sql.DB, cardID int64, title string, dueDate string) (int64, error) {
	res, err := conn.Exec(
		`INSERT INTO card_subtasks (card_id, title, is_done, due_date) VALUES (?, ?, 0, ?)`,
		cardID, title, dueDate,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListSubtasks(conn *sql.DB, cardID int64) ([]models.CardSubtask, error) {
	rows, err := conn.Query(`
		SELECT id, card_id, title, is_done, COALESCE(due_date,''), position, created_at
		FROM card_subtasks
		WHERE card_id = ?
		ORDER BY position ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CardSubtask{}
	for rows.Next() {
		var s models.CardSubtask
		var doneInt int
		if err := rows.Scan(&s.ID, &s.CardID, &s.Title, &doneInt, &s.DueDate, &s.Position, &s.CreatedAt); err != nil {
			return nil, err
		}
		s.IsDone = doneInt == 1
		out = append(out, s)
	}
	return out, nil
}

func ToggleSubtaskDone(conn *sql.DB, subtaskID int64, isDone bool) error {
	doneInt := 0
	if isDone {
		doneInt = 1
	}
	_, err := conn.Exec(`UPDATE card_subtasks SET is_done = ? WHERE id = ?`, doneInt, subtaskID)
	return err
}

func DeleteSubtask(conn *sql.DB, subtaskID int64) error {
	_, err := conn.Exec(`DELETE FROM card_subtasks WHERE id = ?`, subtaskID)
	return err
}

// ---------- Assignees

func ListAssignees(conn *sql.DB, cardID int64) ([]models.CardAssignee, error) {
	rows, err := conn.Query(`
		SELECT u.id, u.full_name, u.email, u.role
		FROM card_assignments ca
		JOIN users u ON u.id = ca.user_id
		WHERE ca.card_id = ?
		ORDER BY u.full_name ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CardAssignee{}
	for rows.Next() {
		var a models.CardAssignee
		if err := rows.Scan(&a.UserID, &a.FullName, &a.Email, &a.Role); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func AddAssignee(conn *sql.DB, cardID, userID int64) error {
	_, err := conn.Exec(`
		INSERT INTO card_assignments (card_id, user_id)
		VALUES (?, ?)
		ON CONFLICT(card_id, user_id) DO NOTHING
	`, cardID, userID)
	return err
}

func RemoveAssignee(conn *sql.DB, cardID, userID int64) error {
	_, err := conn.Exec(`DELETE FROM card_assignments WHERE card_id = ? AND user_id = ?`, cardID, userID)
	return err
}