package handlers

import (
	"database/sql"
	"encoding/json"
	_ "github.com/mattn/go-sqlite3"
	"net/http/httptest"
	"testing"
)

func TestMonthlyReportBoundariesAndEvidence(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)
	_, err = conn.Exec(`
 CREATE TABLE users(id INTEGER,full_name TEXT,role TEXT);
 CREATE TABLE user_roles(user_id INTEGER,role TEXT);
 CREATE TABLE supervisor_files(id INTEGER,supervisor_user_id INTEGER);
 CREATE TABLE boards(id INTEGER,supervisor_file_id INTEGER,name TEXT);
 CREATE TABLE lists(id INTEGER,board_id INTEGER);
 CREATE TABLE cards(id INTEGER,list_id INTEGER,created_at TEXT);
 CREATE TABLE card_activity(card_id INTEGER,action TEXT,created_at TEXT);
 CREATE TABLE meetings(id INTEGER,starts_at TEXT);
 CREATE TABLE meeting_participants(meeting_id INTEGER,user_id INTEGER,attendance_status TEXT);
 CREATE TABLE supervisor_students(supervisor_user_id INTEGER,student_user_id INTEGER);
 CREATE TABLE board_members(board_id INTEGER,user_id INTEGER,added_at TEXT);
 INSERT INTO users VALUES(1,'Admin','admin'),(2,'Supervisor','supervisor'),(3,'Talent','student');
 INSERT INTO supervisor_files VALUES(1,2);
 INSERT INTO boards VALUES(10,1,'smart-road'),(11,1,'filler');
 INSERT INTO lists VALUES(20,10),(21,11);
 INSERT INTO cards VALUES(30,20,'2025-01-31 20:59:59'),(31,20,'2025-01-31 21:00:00'),(32,20,'2025-02-28 21:00:00');
 INSERT INTO card_activity VALUES(30,'status_done','2025-02-10 10:00:00'),(30,'status_done','2025-02-15 10:00:00'),(31,'card_updated','2025-02-10 10:00:00'),(32,'status_done','2025-02-28 21:00:00');
 INSERT INTO meetings VALUES(40,'2025-01-31T21:00:00Z'),(41,'2025-02-28T21:00:00Z');
 INSERT INTO meeting_participants VALUES(40,3,'attended'),(41,3,'unknown');
 INSERT INTO supervisor_students VALUES(2,3);
 INSERT INTO board_members VALUES(10,3,'2025-01-20 10:00:00'),(11,3,'2025-02-15 10:00:00');
 `)
	if err != nil {
		t.Fatal(err)
	}
	api := &API{conn: conn}
	w := httptest.NewRecorder()
	api.AdminMonthlyReport(w, httptest.NewRequest("GET", "/admin/reports/monthly?month=2025-02", nil))
	if w.Code != 200 {
		t.Fatalf("%d: %s", w.Code, w.Body.String())
	}
	var result struct {
		Tasks []struct {
			BoardID     int `json:"board_id"`
			Added, Done int
		}
		Participants []struct {
			MeetingID int `json:"meeting_id"`
		}
		Journeys []struct{ Start, End string }
	}
	if err = json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Tasks) != 2 || result.Tasks[0].Added != 1 || result.Tasks[0].Done != 1 || result.Tasks[1].Added != 0 || result.Tasks[1].Done != 0 {
		t.Fatalf("incorrect per-board counts: %+v", result.Tasks)
	}
	if len(result.Participants) != 1 || result.Participants[0].MeetingID != 40 {
		t.Fatalf("wrong participants: %+v", result.Participants)
	}
	if len(result.Journeys) != 1 || result.Journeys[0].Start != "smart-road" || result.Journeys[0].End != "filler" {
		t.Fatalf("wrong journey: %+v", result.Journeys)
	}
	for _, month := range []string{"", "invalid", "2025-13", "2999-01"} {
		w = httptest.NewRecorder()
		api.AdminMonthlyReport(w, httptest.NewRequest("GET", "/admin/reports/monthly?month="+month, nil))
		if w.Code != 400 {
			t.Fatalf("month %q: %d", month, w.Code)
		}
	}
	if _, err = conn.Exec("UPDATE users SET role='supervisor' WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	api.AdminMonthlyReport(w, httptest.NewRequest("GET", "/admin/reports/monthly?month=2025-02", nil))
	if w.Code != 403 {
		t.Fatalf("non-admin: %d", w.Code)
	}
}
