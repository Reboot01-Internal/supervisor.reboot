package handlers

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"taskflow/internal/db"
)

var projectBoardPattern = regexp.MustCompile(`(?i)(?:^|-)(?:go-reloaded|ascii-art-web|ascii-art|groupie-tracker|lem-in|real-time-forum|forum|make-your-game|graphql|social-network|mini-framework|bomberman-dom|smart-road|filler|rt|localhost|multiplayer-fps|0-shell)(?:-\d+)?$`)

func (a *API) BoardCover(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.URL.Query().Get("board_id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid board_id")
		return
	}
	if strings.TrimSpace(r.Header.Get("X-User-Email")) == "" && strings.TrimSpace(r.Header.Get("X-User-Login")) == "" {
		writeErr(w, 401, "sign in required")
		return
	}
	actor := actorID(r, a.conn)
	var role string
	if err := a.conn.QueryRow(`SELECT role FROM users WHERE id = ? AND is_active = 1`, actor).Scan(&role); err != nil {
		writeErr(w, 403, "forbidden")
		return
	}
	var name string
	var owner int64
	if err := a.conn.QueryRow(`SELECT b.name, sf.supervisor_user_id FROM boards b JOIN supervisor_files sf ON sf.id=b.supervisor_file_id WHERE b.id=?`, id).Scan(&name, &owner); err != nil {
		writeErr(w, 404, "board not found")
		return
	}
	if r.Method == http.MethodGet {
		allowed := role == "admin" || owner == actor
		if !allowed {
			allowed, err = db.CanViewBoard(a.conn, id, actor)
			if err != nil {
				writeErr(w, 500, "could not check access")
				return
			}
		}
		if !allowed {
			writeErr(w, 403, "not your board")
			return
		}
		var data []byte
		var mime string
		err := a.conn.QueryRow(`SELECT image, mime_type FROM board_covers WHERE board_id=?`, id).Scan(&data, &mime)
		if err == sql.ErrNoRows {
			writeErr(w, 404, "cover not found")
			return
		}
		if err != nil {
			writeErr(w, 500, "could not load cover")
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "private, no-store")
		_, _ = w.Write(data)
		return
	}
	if role != "admin" && owner != actor {
		writeErr(w, 403, "only the admin or board owner can change this cover")
		return
	}
	if projectBoardPattern.MatchString(strings.TrimSpace(name)) {
		writeErr(w, 400, "project boards use their project illustration")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, (5<<20)+(64<<10))
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		writeErr(w, 400, "choose an image smaller than 5 MB")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, _, err := r.FormFile("image")
	if err != nil {
		writeErr(w, 400, "image required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, (5<<20)+1))
	if err != nil || len(data) > 5<<20 {
		writeErr(w, 400, "choose an image smaller than 5 MB")
		return
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || config.Width > 8000 || config.Height > 8000 || int64(config.Width)*int64(config.Height) > 24000000 {
		writeErr(w, 400, "choose a valid PNG, JPG, or GIF up to 24 megapixels")
		return
	}
	mime := map[string]string{"png": "image/png", "jpeg": "image/jpeg", "gif": "image/gif"}[format]
	if mime == "" {
		writeErr(w, 400, "choose a PNG, JPG, or GIF")
		return
	}
	if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
		writeErr(w, 400, "image is damaged")
		return
	}
	version := fmt.Sprintf("%x", sha256.Sum256(data))
	_, err = a.conn.Exec(`INSERT INTO board_covers (board_id,image,mime_type,version) VALUES (?,?,?,?) ON CONFLICT(board_id) DO UPDATE SET image=excluded.image,mime_type=excluded.mime_type,version=excluded.version`, id, data, mime, version)
	if err != nil {
		writeErr(w, 500, "could not save cover")
		return
	}
	writeJSON(w, 200, map[string]string{"cover_version": version})
}
