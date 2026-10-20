package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"taskflow/internal/db"
	"testing"
)

func contentTestAPI(t *testing.T) *API {
	t.Helper()
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	conn.SetMaxOpenConns(1)
	for _, file := range []string{"001_init.sql", "002_activity.sql", "004_comments_attachments_reminders.sql", "018_list_colors.sql"} {
		data, err := os.ReadFile("../../migrations/" + file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = conn.Exec(string(data)); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 2; i++ {
		if err = db.EnsureBoardContentRoles(conn); err != nil {
			t.Fatal(err)
		}
	}
	_, err = conn.Exec(`INSERT INTO users(id,full_name,email,password_hash,role,nickname,cohort) VALUES
 (1,'Admin','admin@test','','admin','admin',''),(2,'Supervisor','sup@test','','supervisor','sup',''),(3,'Talent A','a@test','','student','a',''),(4,'Talent B','b@test','','student','b',''),(5,'Outsider','out@test','','student','out','');
 INSERT INTO supervisor_files(id,supervisor_user_id) VALUES(1,2);
 INSERT INTO boards(id,supervisor_file_id,name,created_by) VALUES(1,1,'Shared',2),(2,1,'Other',2);
 INSERT INTO board_members(board_id,user_id) VALUES(1,3),(1,4);
 INSERT INTO lists(id,board_id,title,position,created_by_role) VALUES(1,1,'Staff',0,'supervisor'),(2,1,'Talent',1,'student'),(3,2,'Elsewhere',0,'student'),(4,1,'Legacy',2,'');
 INSERT INTO cards(id,list_id,title,position,created_by_role) VALUES(1,1,'Staff card',0,'supervisor'),(2,1,'Talent card A',1,'student'),(3,1,'Talent card B',2,'student'),(4,2,'Staff in talent list',0,'admin'),(5,3,'Other board card',0,'student'),(6,4,'Legacy card',0,'');
 INSERT INTO card_subtasks(id,card_id,title) VALUES(1,1,'Staff checklist'),(2,2,'Talent checklist');`)
	if err != nil {
		t.Fatal(err)
	}
	return &API{conn: conn}
}

func contentRequest(t *testing.T, fn http.HandlerFunc, role, email, body string, want int) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest("POST", "/", strings.NewReader(body))
	r.Header.Set("X-User-Role", role)
	r.Header.Set("X-User-Email", email)
	w := httptest.NewRecorder()
	fn(w, r)
	if w.Code != want {
		t.Fatalf("got %d want %d: %s (body %s)", w.Code, want, w.Body.String(), body)
	}
	return w
}

func TestTalentsCollaborateOnBoardContent(t *testing.T) {
	a := contentTestAPI(t)
	w := contentRequest(t, a.AdminCreateList, "student", "a@test", `{"board_id":1,"title":"Talent ideas"}`, 201)
	var created struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	listID := created.ID
	contentRequest(t, a.AdminUpdateList, "student", "b@test", fmt.Sprintf(`{"list_id":%d,"title":"Team ideas","color":"#aabbcc"}`, listID), 200)
	w = contentRequest(t, a.AdminCreateCard, "student", "a@test", fmt.Sprintf(`{"list_id":%d,"title":"Draft"}`, listID), 201)
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	cardID := created.ID
	contentRequest(t, a.AdminUpdateCard, "student", "b@test", fmt.Sprintf(`{"card_id":%d,"title":"Peer edit","description":"Shared work","status":"doing","priority":"high"}`, cardID), 200)
	card, err := db.GetCardWithDue(a.conn, cardID)
	if err != nil || card.Title != "Peer edit" || card.CreatedByRole != "student" {
		t.Fatalf("unexpected card: %+v %v", card, err)
	}
	contentRequest(t, a.AdminCreateSubtask, "student", "b@test", fmt.Sprintf(`{"card_id":%d,"title":"Peer checklist"}`, cardID), 201)
	contentRequest(t, a.AdminToggleSubtask, "student", "b@test", `{"subtask_id":2,"is_done":true}`, 200)
	contentRequest(t, a.AdminMoveCard, "student", "b@test", fmt.Sprintf(`{"card_id":%d,"to_list_id":1,"to_position":4}`, cardID), 200)
	contentRequest(t, a.AdminDeleteCard, "student", "b@test", fmt.Sprintf(`{"card_id":%d}`, cardID), 200)
	contentRequest(t, a.AdminDeleteList, "student", "b@test", fmt.Sprintf(`{"list_id":%d}`, listID), 200)
	contentRequest(t, a.AdminCreateCard, "student", "b@test", `{"list_id":1,"title":"New talent card"}`, 201)
	lists, err := db.ListLists(a.conn, 1)
	if err != nil || len(lists) == 0 {
		t.Fatalf("list roles missing: %v", err)
	}
}

func TestProtectedBoardContentRejectsTalentWrites(t *testing.T) {
	a := contentTestAPI(t)
	cases := []struct {
		name string
		fn   http.HandlerFunc
		body string
	}{
		{"staff list rename", a.AdminUpdateList, `{"list_id":1,"title":"Changed"}`},
		{"staff list color", a.AdminUpdateList, `{"list_id":1,"color":"#aabbcc"}`},
		{"staff list delete", a.AdminDeleteList, `{"list_id":1}`},
		{"legacy list", a.AdminDeleteList, `{"list_id":4}`},
		{"staff inside talent list", a.AdminDeleteList, `{"list_id":2}`},
		{"staff card edit", a.AdminUpdateCard, `{"card_id":1,"title":"Changed","status":"done"}`},
		{"legacy card", a.AdminDeleteCard, `{"card_id":6}`},
		{"staff card delete", a.AdminDeleteCard, `{"card_id":1}`},
		{"staff card move", a.AdminMoveCard, `{"card_id":1,"to_list_id":2,"to_position":0}`},
		{"cross board move", a.AdminMoveCard, `{"card_id":2,"to_list_id":3,"to_position":0}`},
		{"staff checklist create", a.AdminCreateSubtask, `{"card_id":1,"title":"Changed"}`},
		{"staff checklist update", a.AdminUpdateSubtask, `{"subtask_id":1,"title":"Changed"}`},
		{"staff checklist delete", a.AdminDeleteSubtask, `{"subtask_id":1}`},
		{"staff card label", a.AdminAddCardLabel, `{"card_id":1,"label_id":1}`},
		{"staff card assign", a.AdminAddAssignee, `{"card_id":1,"user_id":3}`},
		{"staff card comment", a.AdminAddComment, `{"card_id":1,"body":"Changed"}`},
		{"staff card reminder", a.AdminCreateReminder, `{"card_id":1,"remind_at":"2026-11-01"}`},
		{"other board edit", a.AdminUpdateCard, `{"card_id":5,"title":"Changed"}`},
		{"other board create", a.AdminCreateList, `{"board_id":2,"title":"Changed"}`},
		{"staff reorder", a.AdminReorderCards, `{"list_id":1,"ids":[2,1,3]}`},
		{"duplicate reorder", a.AdminReorderCards, `{"list_id":1,"ids":[1,2,2]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) { contentRequest(t, tc.fn, "student", "a@test", tc.body, 403) })
	}
	contentRequest(t, a.AdminReorderCards, "student", "b@test", `{"list_id":1,"ids":[1,3,2]}`, 200)
	contentRequest(t, a.AdminDeleteCard, "student", "out@test", `{"card_id":2}`, 403)
	contentRequest(t, a.AdminCreateCard, "student", "out@test", `{"list_id":1,"title":"Intruder"}`, 403)
	var title string
	a.conn.QueryRow("SELECT title FROM cards WHERE id=1").Scan(&title)
	if title != "Staff card" {
		t.Fatal("staff card was changed")
	}
}

func TestStaffKeepControlOfBoardContent(t *testing.T) {
	for _, actor := range []struct{ role, email string }{{"supervisor", "sup@test"}, {"admin", "admin@test"}} {
		t.Run(actor.role, func(t *testing.T) {
			a := contentTestAPI(t)
			contentRequest(t, a.AdminUpdateCard, actor.role, actor.email, `{"card_id":2,"title":"Staff edited","status":"doing"}`, 200)
			contentRequest(t, a.AdminUpdateList, actor.role, actor.email, `{"list_id":2,"title":"Staff renamed"}`, 200)
			contentRequest(t, a.AdminDeleteCard, actor.role, actor.email, `{"card_id":1}`, 200)
		})
	}
}

func TestTalentCanCompleteProtectedCardsWithoutEditingFields(t *testing.T) {
	a := contentTestAPI(t)
	for _, id := range []int{1, 4, 6} {
		current, err := db.GetCardWithDue(a.conn, int64(id))
		if err != nil {
			t.Fatal(err)
		}
		for _, status := range []string{"done", "todo"} {
			body := fmt.Sprintf(`{"card_id":%d,"title":%q,"description":%q,"due_date":%q,"status":%q,"priority":%q}`, id, current.Title, current.Description, current.DueDate, status, current.Priority)
			contentRequest(t, a.AdminUpdateCard, "student", "a@test", body, 200)
			after, err := db.GetCardWithDue(a.conn, int64(id))
			if err != nil || after.Status != status || after.Title != current.Title || after.Description != current.Description || after.Priority != current.Priority || after.CreatedByRole != current.CreatedByRole {
				t.Fatalf("completion changed protected fields: %+v %v", after, err)
			}
		}
	}
	contentRequest(t, a.AdminToggleSubtask, "student", "a@test", `{"subtask_id":1,"is_done":true}`, 200)
	contentRequest(t, a.AdminToggleSubtask, "student", "out@test", `{"subtask_id":1,"is_done":false}`, 403)
	contentRequest(t, a.AdminUpdateCard, "student", "out@test", `{"card_id":1,"title":"Staff card","description":"","due_date":"","status":"done","priority":"medium"}`, 403)
	for _, body := range []string{
		`{"card_id":1,"title":"Staff card","description":"changed","status":"done","priority":"medium"}`,
		`{"card_id":1,"title":"Staff card","status":"doing","priority":"medium"}`,
		`{"card_id":1,"title":"Staff card","status":"done","priority":"urgent"}`,
		`{"card_id":1,"title":"Staff card","status":"done","priority":"medium","due_date":"2026-11-01"}`,
	} {
		contentRequest(t, a.AdminUpdateCard, "student", "a@test", body, 403)
	}
}
