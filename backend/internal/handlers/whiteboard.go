package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"
	"taskflow/internal/db"
)

const sharedWhiteboardKey = "admin_whiteboard_shared_v1"

type whiteboardDocument struct {
	Title    string                       `json:"title"`
	Items    []map[string]json.RawMessage `json:"items"`
	Revision int64                        `json:"revision"`
	Applied  []string                     `json:"applied,omitempty"`
}
type whiteboardChange struct {
	ID     string                     `json:"id"`
	Add    map[string]json.RawMessage `json:"add,omitempty"`
	Set    map[string]json.RawMessage `json:"set,omitempty"`
	Delete bool                       `json:"delete,omitempty"`
}
type whiteboardOperation struct {
	ID      string             `json:"id"`
	Title   *string            `json:"title,omitempty"`
	Changes []whiteboardChange `json:"changes"`
}
type whiteboardPerson struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Login string `json:"login"`
	Color string `json:"color"`
}
type whiteboardPeer struct {
	conn   *websocket.Conn
	send   chan []byte
	person whiteboardPerson
}
type whiteboardHub struct {
	key      string
	mu       sync.Mutex
	document *whiteboardDocument
	clients  map[*whiteboardPeer]bool
}

func (a *API) whiteboardRoom(ids ...string) *whiteboardHub {
	a.whiteboardOnce.Do(func() {
		a.whiteboard = &whiteboardHub{key: sharedWhiteboardKey, clients: make(map[*whiteboardPeer]bool)}
		a.whiteboardRooms = map[string]*whiteboardHub{"default": a.whiteboard}
	})
	id := "default"
	if len(ids) > 0 && ids[0] != "" {
		id = ids[0]
	}
	a.whiteboardMu.Lock()
	defer a.whiteboardMu.Unlock()
	if h := a.whiteboardRooms[id]; h != nil {
		return h
	}
	h := &whiteboardHub{key: "admin_whiteboard_room_" + id, clients: make(map[*whiteboardPeer]bool)}
	a.whiteboardRooms[id] = h
	return h
}
func validWhiteboardID(id string) bool {
	if id == "" || id == "default" {
		return true
	}
	if len(id) != 35 || !strings.HasPrefix(id, "wb_") {
		return false
	}
	_, err := hex.DecodeString(id[3:])
	return err == nil
}
func (a *API) requestWhiteboard(w http.ResponseWriter, r *http.Request) (*whiteboardHub, bool) {
	id := r.URL.Query().Get("board_id")
	if !validWhiteboardID(id) {
		writeErr(w, 400, "Invalid whiteboard ID")
		return nil, false
	}
	if id != "" && id != "default" {
		value, err := db.GetAppSetting(a.conn, "admin_whiteboard_room_"+id)
		if err != nil {
			writeErr(w, 500, "Could not load whiteboard")
			return nil, false
		}
		if value == "" {
			writeErr(w, 404, "Whiteboard not found")
			return nil, false
		}
	}
	return a.whiteboardRoom(id), true
}
func (a *API) whiteboardIdentity(w http.ResponseWriter, r *http.Request) (whiteboardPerson, bool) {
	// Resolve an active existing admin, using the same identity contract as other workspace endpoints.
	verified := r.Clone(r.Context())
	verified.Header = r.Header.Clone()
	for _, key := range []string{"Login", "Email"} {
		if verified.Header.Get("X-User-"+key) == "" {
			verified.Header.Set("X-User-"+key, r.URL.Query().Get(strings.ToLower(key)))
		}
	}
	if !a.attendanceAdmin(w, verified) {
		return whiteboardPerson{}, false
	}
	login, email := verified.Header.Get("X-User-Login"), verified.Header.Get("X-User-Email")
	var person whiteboardPerson
	err := a.conn.QueryRow(`SELECT id,COALESCE(full_name,''),COALESCE(nickname,'') FROM users WHERE (?<>'' AND LOWER(nickname)=LOWER(?)) OR (?='' AND ?<>'' AND LOWER(email)=LOWER(?))`, login, login, login, email, email).Scan(&person.ID, &person.Name, &person.Login)
	if err != nil {
		writeErr(w, 403, "admin access required")
		return person, false
	}
	if person.Name == "" {
		person.Name = person.Login
	}
	person.Color = []string{"#7964d8", "#d97355", "#388dae", "#479d76", "#bb5795"}[person.ID%5]
	return person, true
}
func validateWhiteboard(document whiteboardDocument) error {
	if utf8.RuneCountInString(document.Title) > 160 || document.Items == nil || len(document.Items) > 500 {
		return errors.New("Use up to 500 objects and a title of up to 160 characters")
	}
	ids := map[string]bool{}
	for _, item := range document.Items {
		data, _ := json.Marshal(item)
		var v struct {
			ID, Kind, Color, Text, StickerID string
			X, Y, W, H, Font                 float64
			Points                           [][]float64
		}
		if json.Unmarshal(data, &v) != nil || v.ID == "" || len(v.ID) > 120 || ids[v.ID] {
			return errors.New("Invalid whiteboard object")
		}
		ids[v.ID] = true
		if v.Kind == "sticker" && !validWhiteboardSticker(v.StickerID) {
			return errors.New("Unknown sticker")
		}
		if !strings.Contains("|note|text|rectangle|circle|image|pen|sticker|", "|"+v.Kind+"|") {
			return errors.New("Invalid object type")
		}
		if !strings.Contains("|#ffe580|#c8b6ff|#a6ceff|#ffb780|#ffc5dc|#bce8bc|", "|"+v.Color+"|") {
			return errors.New("Invalid object color")
		}
		for _, n := range []float64{v.X, v.Y, v.W, v.H, v.Font} {
			if math.IsNaN(n) || math.IsInf(n, 0) || math.Abs(n) > 1e7 {
				return errors.New("Invalid object dimensions")
			}
		}
		if v.W <= 0 || v.H <= 0 || v.Font < 1 || v.Font > 200 {
			return errors.New("Invalid object dimensions")
		}
		for _, p := range v.Points {
			if len(p) != 2 {
				return errors.New("Invalid drawing")
			}
		}
		if v.Kind == "image" && !(strings.HasPrefix(v.Text, "data:image/png;base64,") || strings.HasPrefix(v.Text, "data:image/jpeg;base64,") || strings.HasPrefix(v.Text, "data:image/webp;base64,")) {
			return errors.New("Invalid image")
		}
	}
	data, _ := json.Marshal(document)
	if len(data) > 4<<20 {
		return errors.New("Whiteboard images exceed 4 MB. Use smaller images")
	}
	return nil
}

// Existing personal documents remain as backups; merge their objects into the shared canvas once.
func (a *API) loadWhiteboard(h *whiteboardHub) error {
	if h.document != nil {
		return nil
	}
	value, err := db.GetAppSetting(a.conn, h.key)
	if err != nil {
		return err
	}
	doc := whiteboardDocument{Title: "Ideas & inspiration", Items: []map[string]json.RawMessage{}}
	if value != "" {
		if err = json.Unmarshal([]byte(value), &doc); err != nil {
			return err
		}
		h.document = &doc
		return nil
	}
	if h.key != sharedWhiteboardKey {
		return errors.New("Whiteboard not found")
	}
	rows, err := a.conn.Query(`SELECT value FROM app_settings WHERE key GLOB 'admin_whiteboard_[0-9]*' ORDER BY updated_at DESC,key`)
	if err != nil {
		return err
	}
	seenID, seenContent := map[string]bool{}, map[string]bool{}
	first := true
	for rows.Next() {
		var raw string
		if err = rows.Scan(&raw); err != nil {
			rows.Close()
			return err
		}
		var legacy whiteboardDocument
		if json.Unmarshal([]byte(raw), &legacy) != nil {
			continue
		}
		if first || (doc.Title == "Ideas & inspiration" && legacy.Title != "Ideas & inspiration") {
			doc.Title = legacy.Title
			first = false
		}
		for _, item := range legacy.Items {
			var id string
			_ = json.Unmarshal(item["id"], &id)
			content := map[string]json.RawMessage{}
			for k, v := range item {
				if k != "id" {
					content[k] = v
				}
			}
			data, _ := json.Marshal(content)
			if !seenID[id] && !seenContent[string(data)] {
				doc.Items = append(doc.Items, item)
				seenID[id] = true
				seenContent[string(data)] = true
			}
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if err = validateWhiteboard(doc); err != nil {
		return fmt.Errorf("Could not combine old boards: %w. Your original boards are preserved", err)
	}
	data, _ := json.Marshal(doc)
	if err = db.UpsertAppSetting(a.conn, h.key, string(data)); err != nil {
		return err
	}
	h.document = &doc
	return nil
}
func (peer *whiteboardPeer) enqueue(data []byte) {
	select {
	case peer.send <- data:
	default:
		_ = peer.conn.Close()
	}
}
func (h *whiteboardHub) broadcast(message any) {
	data, _ := json.Marshal(message)
	for peer := range h.clients {
		select {
		case peer.send <- data:
		default:
			_ = peer.conn.Close()
		}
	}
}
func (h *whiteboardHub) presence() {
	unique := map[int64]whiteboardPerson{}
	for p := range h.clients {
		unique[p.person.ID] = p.person
	}
	people := []whiteboardPerson{}
	for _, p := range unique {
		people = append(people, p)
	}
	sort.Slice(people, func(i, j int) bool { return people[i].ID < people[j].ID })
	h.broadcast(map[string]any{"type": "presence", "people": people})
}
func (a *API) applyWhiteboard(h *whiteboardHub, op whiteboardOperation) error {
	if op.ID == "" || len(op.ID) > 120 || len(op.Changes) > 500 {
		return errors.New("Invalid whiteboard operation")
	}
	for _, id := range h.document.Applied {
		if id == op.ID {
			return nil
		}
	}
	encoded, _ := json.Marshal(h.document)
	var next whiteboardDocument
	_ = json.Unmarshal(encoded, &next)
	if op.Title != nil {
		next.Title = *op.Title
	}
	for _, change := range op.Changes {
		index := -1
		for n, item := range next.Items {
			var id string
			_ = json.Unmarshal(item["id"], &id)
			if id == change.ID {
				index = n
				break
			}
		}
		if change.Delete {
			if index >= 0 {
				next.Items = append(next.Items[:index], next.Items[index+1:]...)
			}
			continue
		}
		if change.Add != nil {
			if index < 0 {
				var id string
				_ = json.Unmarshal(change.Add["id"], &id)
				if id != change.ID {
					return errors.New("Object ID mismatch")
				}
				next.Items = append(next.Items, change.Add)
			}
			continue
		}
		if index >= 0 {
			for key, value := range change.Set {
				if key == "id" {
					return errors.New("Object IDs cannot change")
				}
				next.Items[index][key] = value
			}
		}
	}
	next.Revision++
	next.Applied = append(next.Applied, op.ID)
	if len(next.Applied) > 2000 {
		next.Applied = next.Applied[len(next.Applied)-2000:]
	}
	if err := validateWhiteboard(next); err != nil {
		return err
	}
	data, _ := json.Marshal(next)
	if err := db.UpsertAppSetting(a.conn, h.key, string(data)); err != nil {
		return errors.New("Could not save shared whiteboard")
	}
	h.document = &next
	h.broadcast(map[string]any{"type": "operation", "operation": op, "revision": next.Revision})
	return nil
}
func (a *API) AdminWhiteboard(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.whiteboardIdentity(w, r); !ok {
		return
	}
	h, ok := a.requestWhiteboard(w, r)
	if !ok {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := a.loadWhiteboard(h); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeErr(w, 405, "Use the live whiteboard connection to edit")
		return
	}
	writeJSON(w, 200, h.document)
}
func (a *API) WhiteboardStream(w http.ResponseWriter, r *http.Request) {
	person, ok := a.whiteboardIdentity(w, r)
	if !ok {
		return
	}
	h, ok := a.requestWhiteboard(w, r)
	if !ok {
		return
	}
	h.mu.Lock()
	err := a.loadWhiteboard(h)
	h.mu.Unlock()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	conn, err := notificationUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	peer := &whiteboardPeer{conn: conn, send: make(chan []byte, 128), person: person}
	h.mu.Lock()
	h.clients[peer] = true
	initial, _ := json.Marshal(map[string]any{"type": "state", "document": h.document})
	peer.send <- initial
	h.presence()
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clients, peer)
		h.presence()
		close(peer.send)
		h.mu.Unlock()
		_ = conn.Close()
	}()
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		defer conn.Close()
		for {
			select {
			case data, open := <-peer.send:
				if !open {
					return
				}
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if conn.WriteMessage(websocket.TextMessage, data) != nil {
					return
				}
			case <-ticker.C:
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if conn.WriteMessage(websocket.PingMessage, nil) != nil {
					return
				}
			}
		}
	}()
	conn.SetReadLimit(4 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(60 * time.Second)) })
	for {
		var op whiteboardOperation
		if conn.ReadJSON(&op) != nil {
			return
		}
		h.mu.Lock()
		before := h.document.Revision
		err := a.applyWhiteboard(h, op)
		if err != nil {
			data, _ := json.Marshal(map[string]any{"type": "error", "id": op.ID, "error": err.Error(), "retryable": err.Error() == "Could not save shared whiteboard"})
			peer.enqueue(data)
		} else if h.document.Revision == before {
			data, _ := json.Marshal(map[string]any{"type": "ack", "id": op.ID})
			peer.enqueue(data)
		}
		h.mu.Unlock()
	}
}

// AdminWhiteboards lists and creates shared canvases; the original board retains its existing storage key.
func (a *API) AdminWhiteboards(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.whiteboardIdentity(w, r); !ok {
		return
	}
	if r.Method == http.MethodPost {
		r.Body = http.MaxBytesReader(w, r.Body, 1024)
		var req struct {
			Title string `json:"title"`
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil || strings.TrimSpace(req.Title) == "" || utf8.RuneCountInString(req.Title) > 160 {
			writeErr(w, 400, "Enter a whiteboard name of up to 160 characters")
			return
		}
		random := make([]byte, 16)
		if _, err := rand.Read(random); err != nil {
			writeErr(w, 500, "Could not create whiteboard")
			return
		}
		id := "wb_" + hex.EncodeToString(random)
		doc := whiteboardDocument{Title: strings.TrimSpace(req.Title), Items: []map[string]json.RawMessage{}, Revision: 1}
		raw, _ := json.Marshal(doc)
		if err := db.UpsertAppSetting(a.conn, "admin_whiteboard_room_"+id, string(raw)); err != nil {
			writeErr(w, 500, "Could not save whiteboard")
			return
		}
		writeJSON(w, 201, map[string]any{"id": id, "title": doc.Title, "objects": 0})
		return
	}
	if r.Method != http.MethodGet {
		writeErr(w, 405, "Method not allowed")
		return
	}
	h := a.whiteboardRoom()
	h.mu.Lock()
	err := a.loadWhiteboard(h)
	h.mu.Unlock()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	rows, err := a.conn.Query(`SELECT key,value,updated_at FROM app_settings WHERE key=? OR key GLOB 'admin_whiteboard_room_wb_*' ORDER BY updated_at DESC,key`, sharedWhiteboardKey)
	if err != nil {
		writeErr(w, 500, "Could not list whiteboards")
		return
	}
	defer rows.Close()
	type entry struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		Objects   int    `json:"objects"`
		UpdatedAt string `json:"updated_at"`
	}
	result := []entry{}
	for rows.Next() {
		var key, value, updated string
		if rows.Scan(&key, &value, &updated) != nil {
			writeErr(w, 500, "Could not read whiteboards")
			return
		}
		var doc whiteboardDocument
		if json.Unmarshal([]byte(value), &doc) != nil {
			writeErr(w, 500, "Could not read whiteboard document")
			return
		}
		id := "default"
		if key != sharedWhiteboardKey {
			id = strings.TrimPrefix(key, "admin_whiteboard_room_")
		}
		result = append(result, entry{ID: id, Title: doc.Title, Objects: len(doc.Items), UpdatedAt: updated})
	}
	if rows.Err() != nil {
		writeErr(w, 500, "Could not list whiteboards")
		return
	}
	writeJSON(w, 200, result)
}

func validWhiteboardSticker(id string) bool {
	switch id {
	case "cute-star", "cute-cloud", "cute-coffee-cat", "cute-heart", "cute-flower", "cute-coffee", "cute-plant", "cute-rocket", "cute-idea", "cute-laptop", "cute-checklist", "cute-moon",
		"helper-comment", "helper-question", "helper-idea", "helper-important", "helper-todo", "helper-progress", "helper-done", "helper-blocked", "helper-deadline", "helper-decision", "helper-connect", "helper-reminder", "helper-code", "helper-braces", "helper-brackets", "helper-syntax":
		return true
	}
	return false
}
