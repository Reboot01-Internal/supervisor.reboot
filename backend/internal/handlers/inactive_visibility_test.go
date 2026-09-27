package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestInactiveTalentVisibilityPreservesRecords(t *testing.T) {
	c, err := sql.Open("sqlite3", "file:inactive_visibility?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	_, err = c.Exec(`
 CREATE TABLE users(id INTEGER,full_name TEXT,nickname TEXT,email TEXT,is_active INTEGER,role TEXT,cohort TEXT);
 CREATE TABLE supervisor_students(supervisor_user_id INTEGER,student_user_id INTEGER);
 CREATE TABLE supervisor_files(id INTEGER,supervisor_user_id INTEGER);
 CREATE TABLE boards(id INTEGER,name TEXT,supervisor_file_id INTEGER);
 CREATE TABLE board_members(board_id INTEGER,user_id INTEGER);
 INSERT INTO users VALUES(2,'Active','active','a@test',1,'student','1'),(3,'Inactive','inactive','i@test',0,'student','1');
 INSERT INTO supervisor_students VALUES(1,2),(1,3);
 INSERT INTO supervisor_files VALUES(10,1);
 INSERT INTO boards VALUES(20,'Project',10);
 INSERT INTO board_members VALUES(20,2),(20,3);
 `)
	if err != nil {
		t.Fatal(err)
	}
	a := &API{conn: c}
	for _, history := range []bool{false, true} {
		section, err := a.profileForSupervisor(1, history)
		if err != nil {
			t.Fatal(err)
		}
		want := 1
		if history {
			want = 2
		}
		if len(section.AssignedStudents) != want || section.AssignedStudentsOverall != int64(want) {
			t.Fatalf("history=%v: %+v", history, section)
		}
		if section.Boards[0].StudentsCount != 1 {
			t.Fatal("inactive member included in active count")
		}
	}
	w := httptest.NewRecorder()
	a.AdminAssignList(w, httptest.NewRequest("GET", "/admin/assign/list?supervisor_id=1", nil))
	var people []assignUser
	if err := json.Unmarshal(w.Body.Bytes(), &people); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(people) != 1 || people[0].ID != 2 {
		t.Fatalf("assignment options: %s", w.Body.String())
	}
	var count int
	if err := c.QueryRow("SELECT COUNT(*) FROM supervisor_students").Scan(&count); err != nil || count != 2 {
		t.Fatal("historical assignments were changed")
	}
}
