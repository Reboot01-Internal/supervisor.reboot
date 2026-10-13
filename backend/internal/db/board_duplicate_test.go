package db

import (
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
	"os"
	"testing"
)

func TestDuplicateBoard(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)
	for _, file := range []string{"001_init.sql", "003_card_meta.sql", "018_list_colors.sql", "020_board_covers.sql"} {
		data, e := os.ReadFile("../../migrations/" + file)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = conn.Exec(string(data)); e != nil {
			t.Fatal(e)
		}
	}
	_, err = conn.Exec(`INSERT INTO users(id,full_name,email,password_hash,role,nickname,cohort) VALUES(1,'Owner','o','','supervisor','',''),(2,'A','a','','student','',''),(3,'B','b','','student','',''),(4,'C','c','','student','','');
 INSERT INTO supervisor_files(id,supervisor_user_id) VALUES(1,1);
 INSERT INTO boards(id,supervisor_file_id,name,description,created_by) VALUES(1,1,'rt','Project',1);
 INSERT INTO board_members(board_id,user_id) VALUES(1,1),(1,2),(1,3);
 INSERT INTO lists(id,board_id,title,position) VALUES(1,1,'Tasks',4);
 INSERT INTO list_colors VALUES(1,'#aabbcc');
 INSERT INTO cards(id,list_id,title,description,position,due_date,status,priority) VALUES(1,1,'Build','Details',2,'2026-10-20','done','high');
 INSERT INTO card_subtasks(card_id,title,is_done,due_date,position) VALUES(1,'Step',1,'2026-10-19',3);
 INSERT INTO card_assignments(card_id,user_id) VALUES(1,2),(1,3);
 INSERT INTO labels(id,board_id,name,color) VALUES(1,1,'Feature','blue');
 INSERT INTO card_labels(card_id,label_id) VALUES(1,1);
 INSERT INTO board_covers VALUES(1,X'1234','image/png','v1');`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = conn.Exec(`INSERT INTO boards(supervisor_file_id,name,created_by) VALUES(1,'ralhalwa-go-reloaded-1',1),(1,'ralhalwa-go-reloaded-3',1),(1,'ralhalwa-go-reloaded-1 (copy)',1),(1,'ralhalwa-rt-8',1)`); err != nil {
		t.Fatal(err)
	}
	var source int64
	conn.QueryRow(`SELECT id FROM boards WHERE name='ralhalwa-go-reloaded-1 (copy)'`).Scan(&source)
	name, err := NextDuplicateBoardName(conn, source)
	if err != nil || name != "ralhalwa-go-reloaded-4" {
		t.Fatalf("suggested name %q: %v", name, err)
	}
	if _, err = conn.Exec(`DELETE FROM boards WHERE id != 1`); err != nil {
		t.Fatal(err)
	}
	id, err := DuplicateBoard(conn, 1, 1, "rt copy", []int64{2, 4, 4})
	if err != nil {
		t.Fatal(err)
	}
	checks := []struct {
		query string
		want  int
	}{
		{`SELECT COUNT(*) FROM board_members WHERE board_id=?`, 3},
		{`SELECT COUNT(*) FROM cards c JOIN lists l ON l.id=c.list_id WHERE l.board_id=? AND c.title='Build' AND c.status='todo' AND c.due_date IS NULL AND c.description='Details' AND c.priority='high' AND c.position=2`, 1},
		{`SELECT COUNT(*) FROM card_assignments a JOIN cards c ON c.id=a.card_id JOIN lists l ON l.id=c.list_id WHERE l.board_id=? AND a.user_id=2`, 1},
		{`SELECT COUNT(*) FROM card_assignments a JOIN cards c ON c.id=a.card_id JOIN lists l ON l.id=c.list_id WHERE l.board_id=? AND a.user_id=3`, 0},
		{`SELECT COUNT(*) FROM card_subtasks s JOIN cards c ON c.id=s.card_id JOIN lists l ON l.id=c.list_id WHERE l.board_id=? AND s.is_done=0 AND s.due_date IS NULL AND s.title='Step' AND s.position=3`, 1},
		{`SELECT COUNT(*) FROM card_labels cl JOIN labels lb ON lb.id=cl.label_id JOIN cards c ON c.id=cl.card_id JOIN lists l ON l.id=c.list_id WHERE l.board_id=? AND lb.board_id=l.board_id`, 1},
		{`SELECT COUNT(*) FROM list_colors lc JOIN lists l ON l.id=lc.list_id WHERE l.board_id=? AND lc.color='#aabbcc'`, 1},
		{`SELECT COUNT(*) FROM board_covers WHERE board_id=?`, 1},
	}
	for _, check := range checks {
		var got int
		if err = conn.QueryRow(check.query, id).Scan(&got); err != nil || got != check.want {
			t.Fatalf("%s: got %d want %d err %v", check.query, got, check.want, err)
		}
	}
	var original int
	conn.QueryRow(`SELECT COUNT(*) FROM card_assignments WHERE card_id=1`).Scan(&original)
	if original != 2 {
		t.Fatal("source assignments changed")
	}
	var originalStatus, originalDue, subtaskDue string
	var originalDone int
	if err = conn.QueryRow(`SELECT status,due_date FROM cards WHERE id=1`).Scan(&originalStatus, &originalDue); err != nil {
		t.Fatal(err)
	}
	if err = conn.QueryRow(`SELECT is_done,due_date FROM card_subtasks WHERE card_id=1`).Scan(&originalDone, &subtaskDue); err != nil {
		t.Fatal(err)
	}
	if originalStatus != "done" || originalDue != "2026-10-20" || originalDone != 1 || subtaskDue != "2026-10-19" {
		t.Fatal("source progress or dates changed")
	}
	// Invalid membership must roll back the whole copy.
	if _, err = DuplicateBoard(conn, 1, 1, "bad", []int64{999}); err == nil {
		t.Fatal("expected foreign key failure")
	}
	var boards int
	conn.QueryRow(`SELECT COUNT(*) FROM boards`).Scan(&boards)
	if boards != 2 {
		t.Fatalf("partial duplicate persisted: %d", boards)
	}
	if _, err = conn.Exec(`UPDATE cards SET title='Changed' WHERE list_id IN (SELECT id FROM lists WHERE board_id=?)`, id); err != nil {
		t.Fatal(err)
	}
	var title string
	conn.QueryRow(`SELECT title FROM cards WHERE id=1`).Scan(&title)
	if title != "Build" {
		t.Fatal("copy edits changed source")
	}
}
