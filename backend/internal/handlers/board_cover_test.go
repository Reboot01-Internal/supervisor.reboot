package handlers

import (
	"bytes"
	"database/sql"
	"image"
	"image/png"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"testing"
)

func TestBoardCoverAccessAndValidation(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)
	_, err = conn.Exec(`CREATE TABLE users(id INTEGER, email TEXT, full_name TEXT, password_hash TEXT, role TEXT, is_active INTEGER);
 CREATE TABLE supervisor_files(id INTEGER, supervisor_user_id INTEGER);
 CREATE TABLE boards(id INTEGER PRIMARY KEY, supervisor_file_id INTEGER, name TEXT);
 CREATE TABLE board_members(board_id INTEGER, user_id INTEGER);
 INSERT INTO users VALUES(1,'admin@test','Admin','','admin',1),(2,'owner@test','Owner','','supervisor',1),(3,'member@test','Member','','supervisor',1),(4,'other@test','Other','','supervisor',1);
 INSERT INTO supervisor_files VALUES(1,2);
 INSERT INTO boards VALUES(10,1,'Custom workspace'),(11,1,'owner-ascii-art-web-1');
 INSERT INTO board_members VALUES(10,3);`)
	if err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile("../../migrations/020_board_covers.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = conn.Exec(string(migration)); err != nil {
		t.Fatal(err)
	}
	api := &API{conn: conn}
	var valid bytes.Buffer
	if err := png.Encode(&valid, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		email, board string
		data         []byte
		want         int
	}{
		{"member@test", "10", valid.Bytes(), 403}, {"other@test", "10", valid.Bytes(), 403},
		{"owner@test", "11", valid.Bytes(), 400}, {"owner@test", "10", []byte("<svg/>"), 400},
		{"owner@test", "10", valid.Bytes(), 200}, {"admin@test", "10", valid.Bytes(), 200},
	} {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, _ := writer.CreateFormFile("image", "cover.png")
		part.Write(tc.data)
		writer.Close()
		req := httptest.NewRequest("POST", "/admin/boards/cover?board_id="+tc.board, &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("X-User-Email", tc.email)
		// A claimed admin role must not grant a non-admin permission.
		req.Header.Set("X-User-Role", "admin")
		rec := httptest.NewRecorder()
		api.BoardCover(rec, req)
		if rec.Code != tc.want {
			t.Fatalf("%s board %s: got %d: %s", tc.email, tc.board, rec.Code, rec.Body.String())
		}
	}
	for _, tc := range []struct {
		email string
		want  int
	}{{"member@test", 200}, {"other@test", 403}, {"", 401}} {
		req := httptest.NewRequest("GET", "/admin/boards/cover?board_id=10", nil)
		req.Header.Set("X-User-Email", tc.email)
		rec := httptest.NewRecorder()
		api.BoardCover(rec, req)
		if rec.Code != tc.want {
			t.Fatalf("read %s: %d", tc.email, rec.Code)
		}
		if rec.Code == 200 && !bytes.Equal(rec.Body.Bytes(), valid.Bytes()) {
			t.Fatal("cover did not persist")
		}
	}
}

func TestProjectBoardMatching(t *testing.T) {
	for name, want := range map[string]bool{"owner-ascii-art-web-12": true, "owner-real-time-forum-2": true, "graphql": true, "owner-0-shell-1": true, "party": false, "owner-rt-notes": false} {
		if projectBoardPattern.MatchString(name) != want {
			t.Errorf("incorrect match: %s", name)
		}
	}
}
