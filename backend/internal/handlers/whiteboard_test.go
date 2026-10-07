package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	_ "github.com/mattn/go-sqlite3"
	"taskflow/internal/db"
)

func whiteboardTestAPI(t *testing.T) *API {
	t.Helper()
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	conn.SetMaxOpenConns(1)
	t.Cleanup(func() { conn.Close() })
	_, err = conn.Exec(`CREATE TABLE users(id INTEGER,full_name TEXT,nickname TEXT,email TEXT,role TEXT,is_active INTEGER);CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);INSERT INTO users VALUES(1,'First Admin','admin1','one@test','admin',1),(2,'Second Admin','admin2','two@test','admin',1),(3,'Student','student','student@test','student',1),(4,'Inactive Admin','inactive','inactive@test','admin',0)`)
	if err != nil {
		t.Fatal(err)
	}
	return &API{conn: conn}
}
func whiteboardTestItem(id, text string) map[string]json.RawMessage {
	raw := `{"id":"` + id + `","kind":"note","x":120,"y":200,"w":180,"h":180,"font":20,"color":"#ffe580","text":"` + text + `"}`
	var item map[string]json.RawMessage
	_ = json.Unmarshal([]byte(raw), &item)
	return item
}
func TestWhiteboardSharedPersistenceAndAccess(t *testing.T) {
	a := whiteboardTestAPI(t)
	h := a.whiteboardRoom()
	if err := a.loadWhiteboard(h); err != nil {
		t.Fatal(err)
	}
	op := whiteboardOperation{ID: "operation1", Changes: []whiteboardChange{{ID: "note1", Add: whiteboardTestItem("note1", "Shared idea")}}}
	if err := a.applyWhiteboard(h, op); err != nil {
		t.Fatal(err)
	}
	for _, login := range []string{"admin1", "admin2"} {
		r := httptest.NewRequest("GET", "/admin/whiteboard", nil)
		r.Header.Set("X-User-Login", login)
		w := httptest.NewRecorder()
		a.AdminWhiteboard(w, r)
		if w.Code != 200 || !strings.Contains(w.Body.String(), "Shared idea") {
			t.Fatalf("%s cannot see shared note: %d %s", login, w.Code, w.Body.String())
		}
	}
	for _, login := range []string{"student", "inactive", "", "unknown"} {
		r := httptest.NewRequest("GET", "/admin/whiteboard", nil)
		r.Header.Set("X-User-Login", login)
		r.Header.Set("X-User-Role", "admin")
		w := httptest.NewRecorder()
		a.AdminWhiteboard(w, r)
		if w.Code != 403 {
			t.Fatalf("%q access %d", login, w.Code)
		}
	}
	reloaded := &API{conn: a.conn}
	if err := reloaded.loadWhiteboard(reloaded.whiteboardRoom()); err != nil {
		t.Fatal(err)
	}
	if len(reloaded.whiteboard.document.Items) != 1 {
		t.Fatal("Durable shared note missing")
	}
	before := h.document.Revision
	if err := a.applyWhiteboard(h, op); err != nil {
		t.Fatal(err)
	}
	if before != h.document.Revision {
		t.Fatal("Duplicate operation applied twice")
	}
	title := strings.Repeat("x", 161)
	if a.applyWhiteboard(h, whiteboardOperation{ID: "invalid-title", Title: &title}) == nil {
		t.Fatal("Oversized title accepted")
	}
	if a.applyWhiteboard(h, whiteboardOperation{ID: "bad", Changes: []whiteboardChange{{ID: "bad", Add: map[string]json.RawMessage{"id": json.RawMessage(`"bad"`)}}}}) == nil {
		t.Fatal("Malformed object accepted")
	}
}
func TestWhiteboardMigratesExistingNotesWithoutDeletingBackups(t *testing.T) {
	a := whiteboardTestAPI(t)
	first := whiteboardDocument{Title: "Original", Items: []map[string]json.RawMessage{whiteboardTestItem("note1", "My idea"), whiteboardTestItem("template1", "Same example")}}
	second := whiteboardDocument{Title: "Team month", Items: []map[string]json.RawMessage{whiteboardTestItem("note2", "Their idea"), whiteboardTestItem("template2", "Same example")}}
	for key, doc := range map[string]whiteboardDocument{"admin_whiteboard_1": first, "admin_whiteboard_2": second} {
		raw, _ := json.Marshal(doc)
		if err := db.UpsertAppSetting(a.conn, key, string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	_, _ = a.conn.Exec(`UPDATE app_settings SET updated_at=CASE key WHEN 'admin_whiteboard_1' THEN '2026-10-06 01:00:00' ELSE '2026-10-07 01:00:00' END WHERE key IN ('admin_whiteboard_1','admin_whiteboard_2')`)
	h := a.whiteboardRoom()
	if err := a.loadWhiteboard(h); err != nil {
		t.Fatal(err)
	}
	if len(h.document.Items) != 3 || h.document.Title != "Team month" {
		t.Fatalf("Migration result %+v", h.document)
	}
	var count int
	_ = a.conn.QueryRow(`SELECT count(*) FROM app_settings WHERE key IN ('admin_whiteboard_1','admin_whiteboard_2')`).Scan(&count)
	if count != 2 {
		t.Fatal("Original backups removed")
	}
}
func TestWhiteboardWebSocketCollaboration(t *testing.T) {
	a := whiteboardTestAPI(t)
	mux := http.NewServeMux()
	mux.HandleFunc("/admin/whiteboard/stream", a.WhiteboardStream)
	server := httptest.NewServer(mux)
	defer server.Close()
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/admin/whiteboard/stream?login="
	read := func(c *websocket.Conn, kind string) map[string]json.RawMessage {
		t.Helper()
		_ = c.SetReadDeadline(time.Now().Add(3 * time.Second))
		for {
			var event map[string]json.RawMessage
			if err := c.ReadJSON(&event); err != nil {
				t.Fatal(err)
			}
			var typ string
			_ = json.Unmarshal(event["type"], &typ)
			if typ == kind {
				return event
			}
		}
	}
	dial := func(login string) *websocket.Conn {
		t.Helper()
		c, _, err := websocket.DefaultDialer.Dial(url+login, nil)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { c.Close() })
		read(c, "state")
		return c
	}
	c1 := dial("admin1")
	read(c1, "presence")
	c2 := dial("admin2")
	event := read(c1, "presence")
	var people []whiteboardPerson
	_ = json.Unmarshal(event["people"], &people)
	if len(people) != 2 || people[1].Name != "Second Admin" {
		t.Fatalf("Presence: %s", event["people"])
	}
	read(c2, "presence")
	add := whiteboardOperation{ID: "shared-add", Changes: []whiteboardChange{{ID: "note1", Add: whiteboardTestItem("note1", "Live idea")}}}
	_ = c1.WriteJSON(add)
	read(c1, "operation")
	read(c2, "operation")
	// Two clients change different properties of the same object; both changes survive.
	_ = c1.WriteJSON(whiteboardOperation{ID: "move", Changes: []whiteboardChange{{ID: "note1", Set: map[string]json.RawMessage{"x": json.RawMessage(`420`)}}}})
	_ = c2.WriteJSON(whiteboardOperation{ID: "text", Changes: []whiteboardChange{{ID: "note1", Set: map[string]json.RawMessage{"text": json.RawMessage(`"Edited by second admin"`)}}}})
	read(c1, "operation")
	read(c1, "operation")
	read(c2, "operation")
	read(c2, "operation")
	h := a.whiteboardRoom()
	h.mu.Lock()
	item := h.document.Items[0]
	x, text := string(item["x"]), string(item["text"])
	rev := h.document.Revision
	h.mu.Unlock()
	if x != "420" || text != `"Edited by second admin"` {
		t.Fatalf("Concurrent edits lost: %s %s", x, text)
	}
	_ = c1.WriteJSON(add)
	read(c1, "ack")
	h.mu.Lock()
	if h.document.Revision != rev {
		t.Error("Reconnect replay applied twice")
	}
	h.mu.Unlock()
	// Two tabs for one admin count as one person, and closing the final tab removes them.
	c3 := dial("admin2")
	event = read(c1, "presence")
	_ = json.Unmarshal(event["people"], &people)
	if len(people) != 2 {
		t.Fatal("Duplicate tabs inflated presence")
	}
	read(c3, "presence")
	c2.Close()
	read(c1, "presence")
	c3.Close()
	event = read(c1, "presence")
	_ = json.Unmarshal(event["people"], &people)
	if len(people) != 1 {
		t.Fatal("Disconnected admin remains online")
	}
	_, response, err := websocket.DefaultDialer.Dial(url+"student", nil)
	if err == nil || response.StatusCode != 403 {
		t.Fatal("Student accessed admin socket")
	}
	c1.Close()
}

func TestMultipleWhiteboardCreationAndPersistence(t *testing.T) {
	a := whiteboardTestAPI(t)
	request := func(method, path, login, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("X-User-Login", login)
		w := httptest.NewRecorder()
		if strings.Split(path, "?")[0] == "/admin/whiteboards" {
			a.AdminWhiteboards(w, r)
		} else {
			a.AdminWhiteboard(w, r)
		}
		return w
	}
	w := request("POST", "/admin/whiteboards", "admin1", `{"title":"October planning"}`)
	if w.Code != 201 {
		t.Fatalf("Create %d %s", w.Code, w.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	if !validWhiteboardID(created.ID) || created.ID == "default" {
		t.Fatal("Invalid new board ID")
	}
	w = request("GET", "/admin/whiteboard?board_id="+created.ID, "admin2", "")
	var doc whiteboardDocument
	_ = json.Unmarshal(w.Body.Bytes(), &doc)
	if w.Code != 200 || doc.Title != "October planning" || len(doc.Items) != 0 || doc.Revision == 0 {
		t.Fatal("New board is not a fresh blank canvas")
	}
	w = request("GET", "/admin/whiteboards", "admin2", "")
	var list []map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if w.Code != 200 || len(list) != 2 {
		t.Fatalf("Shared list %d %s", w.Code, w.Body.String())
	}
	h := a.whiteboardRoom(created.ID)
	if err := a.loadWhiteboard(h); err != nil {
		t.Fatal(err)
	}
	if err := a.applyWhiteboard(h, whiteboardOperation{ID: "new-room-note", Changes: []whiteboardChange{{ID: "new-note", Add: whiteboardTestItem("new-note", "Only in planning")}}}); err != nil {
		t.Fatal(err)
	}
	w = request("GET", "/admin/whiteboard", "admin1", "")
	if strings.Contains(w.Body.String(), "Only in planning") {
		t.Fatal("New note leaked into original board")
	}
	reloaded := &API{conn: a.conn}
	restored := reloaded.whiteboardRoom(created.ID)
	if err := reloaded.loadWhiteboard(restored); err != nil || len(restored.document.Items) != 1 {
		t.Fatal("New board did not persist across restart")
	}
	for _, body := range []string{`{}`, `{"title":"   "}`, `{"title":"` + strings.Repeat("x", 161) + `"}`} {
		if w = request("POST", "/admin/whiteboards", "admin1", body); w.Code != 400 {
			t.Fatal("Invalid board name accepted")
		}
	}
	if w = request("POST", "/admin/whiteboards", "student", `{"title":"No access"}`); w.Code != 403 {
		t.Fatal("Student created board")
	}
	if w = request("GET", "/admin/whiteboard?board_id=../other", "admin1", ""); w.Code != 400 {
		t.Fatal("Invalid ID accepted")
	}
	if w = request("GET", "/admin/whiteboard?board_id=wb_00000000000000000000000000000000", "admin1", ""); w.Code != 404 {
		t.Fatal("Unknown board did not return 404")
	}
}

func TestWhiteboardRoomsIsolateWebSocketUpdatesAndPresence(t *testing.T) {
	a := whiteboardTestAPI(t)
	ids := []string{"wb_00000000000000000000000000000000", "wb_11111111111111111111111111111111"}
	for _, id := range ids {
		raw, _ := json.Marshal(whiteboardDocument{Title: id, Items: []map[string]json.RawMessage{}, Revision: 1})
		if err := db.UpsertAppSetting(a.conn, "admin_whiteboard_room_"+id, string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/stream", a.WhiteboardStream)
	server := httptest.NewServer(mux)
	defer server.Close()
	read := func(c *websocket.Conn) map[string]json.RawMessage {
		t.Helper()
		_ = c.SetReadDeadline(time.Now().Add(3 * time.Second))
		var m map[string]json.RawMessage
		if err := c.ReadJSON(&m); err != nil {
			t.Fatal(err)
		}
		return m
	}
	dial := func(id, login string) *websocket.Conn {
		t.Helper()
		c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/stream?login="+login+"&board_id="+id, nil)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { c.Close() })
		read(c)
		presence := read(c)
		var people []whiteboardPerson
		_ = json.Unmarshal(presence["people"], &people)
		if len(people) != 1 {
			t.Fatalf("Presence leaked across rooms: %s", presence["people"])
		}
		return c
	}
	c1, c2 := dial(ids[0], "admin1"), dial(ids[1], "admin2")
	for index, c := range []*websocket.Conn{c1, c2} {
		id := ids[index]
		_ = c.WriteJSON(whiteboardOperation{ID: id, Changes: []whiteboardChange{{ID: id, Add: whiteboardTestItem(id, "Independent note")}}})
	}
	for index, c := range []*websocket.Conn{c1, c2} {
		event := read(c)
		var op whiteboardOperation
		_ = json.Unmarshal(event["operation"], &op)
		if op.ID != ids[index] {
			t.Fatalf("Operation leaked into another board: %s", event["operation"])
		}
	}
	for _, id := range ids {
		h := a.whiteboardRoom(id)
		h.mu.Lock()
		if len(h.document.Items) != 1 || string(h.document.Items[0]["id"]) != `"`+id+`"` {
			t.Error("Room data is mixed")
		}
		h.mu.Unlock()
	}
	c1.Close()
	c2.Close()
}

func TestWhiteboardTextFormattingPersistsWithOtherEdits(t *testing.T) {
	a := whiteboardTestAPI(t)
	h := a.whiteboardRoom()
	if err := a.loadWhiteboard(h); err != nil {
		t.Fatal(err)
	}
	if err := a.applyWhiteboard(h, whiteboardOperation{ID: "format-note-add", Changes: []whiteboardChange{{ID: "styled-note", Add: whiteboardTestItem("styled-note", "Formatted text")}}}); err != nil {
		t.Fatal(err)
	}
	style := map[string]json.RawMessage{"align": json.RawMessage(`"right"`), "textColor": json.RawMessage(`"#cc3344"`), "bold": json.RawMessage(`true`), "italic": json.RawMessage(`true`)}
	if err := a.applyWhiteboard(h, whiteboardOperation{ID: "format-note-style", Changes: []whiteboardChange{{ID: "styled-note", Set: style}}}); err != nil {
		t.Fatal(err)
	}
	if err := a.applyWhiteboard(h, whiteboardOperation{ID: "format-note-move", Changes: []whiteboardChange{{ID: "styled-note", Set: map[string]json.RawMessage{"x": json.RawMessage(`320`)}}}}); err != nil {
		t.Fatal(err)
	}
	restored := (&API{conn: a.conn})
	room := restored.whiteboardRoom()
	if err := restored.loadWhiteboard(room); err != nil {
		t.Fatal(err)
	}
	for key, value := range style {
		if string(room.document.Items[0][key]) != string(value) {
			t.Fatalf("Formatting %s was lost after movement or reload", key)
		}
	}
}
