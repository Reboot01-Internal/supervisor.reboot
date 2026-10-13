package db

import (
	"database/sql"
	"regexp"
	"strconv"
	"strings"
)

// DuplicateBoard creates an independent copy atomically. Historical conversations,
// notifications and meetings belong to the original team and are not copied.
func DuplicateBoard(conn *sql.DB, sourceID, actor int64, name string, members []int64) (int64, error) {
	tx, err := conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var fileID, owner int64
	var description string
	if err = tx.QueryRow(`SELECT b.supervisor_file_id, sf.supervisor_user_id, b.description FROM boards b JOIN supervisor_files sf ON sf.id=b.supervisor_file_id WHERE b.id=?`, sourceID).Scan(&fileID, &owner, &description); err != nil {
		return 0, err
	}
	res, err := tx.Exec(`INSERT INTO boards(supervisor_file_id,name,description,created_by) VALUES(?,?,?,?)`, fileID, name, description, actor)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if _, err = tx.Exec(`INSERT INTO board_members(board_id,user_id,role_in_board) VALUES(?,?,'owner')`, id, owner); err != nil {
		return 0, err
	}
	for _, userID := range members {
		if userID == owner {
			continue
		}
		if _, err = tx.Exec(`INSERT OR IGNORE INTO board_members(board_id,user_id) VALUES(?,?)`, id, userID); err != nil {
			return 0, err
		}
	}
	// Read IDs before inserting so cursor iteration never observes the new rows.
	ids := func(query string, arg int64) ([]int64, error) {
		rows, e := tx.Query(query, arg)
		if e != nil {
			return nil, e
		}
		defer rows.Close()
		out := []int64{}
		for rows.Next() {
			var v int64
			if e = rows.Scan(&v); e != nil {
				return nil, e
			}
			out = append(out, v)
		}
		return out, rows.Err()
	}
	clone := func(query string, args ...any) (int64, error) {
		r, e := tx.Exec(query, args...)
		if e != nil {
			return 0, e
		}
		return r.LastInsertId()
	}
	labels, err := ids(`SELECT id FROM labels WHERE board_id=?`, sourceID)
	if err != nil {
		return 0, err
	}
	labelMap := map[int64]int64{}
	for _, old := range labels {
		next, e := clone(`INSERT INTO labels(board_id,name,color) SELECT ?,name,color FROM labels WHERE id=?`, id, old)
		if e != nil {
			return 0, e
		}
		labelMap[old] = next
	}
	lists, err := ids(`SELECT id FROM lists WHERE board_id=? ORDER BY position,id`, sourceID)
	if err != nil {
		return 0, err
	}
	for _, oldList := range lists {
		nextList, e := clone(`INSERT INTO lists(board_id,title,position) SELECT ?,title,position FROM lists WHERE id=?`, id, oldList)
		if e != nil {
			return 0, e
		}
		if _, e = tx.Exec(`INSERT INTO list_colors(list_id,color) SELECT ?,color FROM list_colors WHERE list_id=?`, nextList, oldList); e != nil {
			return 0, e
		}
		cards, e := ids(`SELECT id FROM cards WHERE list_id=? ORDER BY position,id`, oldList)
		if e != nil {
			return 0, e
		}
		for _, oldCard := range cards {
			nextCard, e := clone(`INSERT INTO cards(list_id,title,description,position,due_date,status,priority) SELECT ?,title,description,position,NULL,'todo',priority FROM cards WHERE id=?`, nextList, oldCard)
			if e != nil {
				return 0, e
			}
			if _, e = tx.Exec(`INSERT INTO card_subtasks(card_id,title,is_done,due_date,position) SELECT ?,title,0,NULL,position FROM card_subtasks WHERE card_id=?`, nextCard, oldCard); e != nil {
				return 0, e
			}
			if _, e = tx.Exec(`INSERT INTO card_assignments(card_id,user_id) SELECT ?,ca.user_id FROM card_assignments ca JOIN board_members bm ON bm.user_id=ca.user_id AND bm.board_id=? WHERE ca.card_id=?`, nextCard, id, oldCard); e != nil {
				return 0, e
			}
			for oldLabel, nextLabel := range labelMap {
				if _, e = tx.Exec(`INSERT INTO card_labels(card_id,label_id) SELECT ?,? FROM card_labels WHERE card_id=? AND label_id=?`, nextCard, nextLabel, oldCard, oldLabel); e != nil {
					return 0, e
				}
			}
		}
	}
	if _, err = tx.Exec(`INSERT INTO board_covers(board_id,image,mime_type,version) SELECT ?,image,mime_type,version FROM board_covers WHERE board_id=?`, id, sourceID); err != nil {
		return 0, err
	}
	return id, tx.Commit()
}

// NextDuplicateBoardName follows the existing supervisor-project-number convention.
func NextDuplicateBoardName(conn *sql.DB, sourceID int64) (string, error) {
	board, err := GetBoardBasic(conn, sourceID)
	if err != nil {
		return "", err
	}
	clean := func(name string) string {
		name = strings.TrimSpace(name)
		for strings.HasSuffix(name, " (copy)") {
			name = strings.TrimSpace(strings.TrimSuffix(name, " (copy)"))
		}
		return name
	}
	suffix := regexp.MustCompile(`-([0-9]+)$`)
	base := suffix.ReplaceAllString(clean(board.Name), "")
	boards, err := ListBoardsBySupervisorFile(conn, board.SupervisorFileID)
	if err != nil {
		return "", err
	}
	max := 0
	for _, candidate := range boards {
		name := clean(candidate.Name)
		if name == base {
			if max < 1 {
				max = 1
			}
			continue
		}
		if suffix.ReplaceAllString(name, "") != base {
			continue
		}
		match := suffix.FindStringSubmatch(name)
		if len(match) == 2 {
			number, e := strconv.Atoi(match[1])
			if e == nil && number > max {
				max = number
			}
		}
	}
	return base + "-" + strconv.Itoa(max+1), nil
}
