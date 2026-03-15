package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	_ "github.com/mattn/go-sqlite3"

	"taskflow/internal/db"
	"taskflow/internal/discord"
	"taskflow/internal/handlers"
)

func main() {
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/app.db"
	}

	conn, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	if err := runMigrations(conn); err != nil {
		log.Fatal(err)
	}

	if err := db.SeedAdmin(conn); err != nil {
		log.Fatal(err)
	}

	api := handlers.NewAPI(conn, discord.NewFromEnv())
	api.StartDiscordReminderWorker()

	r := chi.NewRouter()

	// ✅ CORS FIX
	allowedOrigins := []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	if extra := os.Getenv("CORS_ORIGINS"); extra != "" {
		for _, o := range strings.Split(extra, ",") {
			if t := strings.TrimSpace(o); t != "" {
				allowedOrigins = append(allowedOrigins, t)
			}
		}
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: allowedOrigins,
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",

			// ✅ allow your identity headers
			"X-User-Email",
			"X-User-Role",
			"X-User-Login",
		},
		ExposedHeaders: []string{
			"Content-Type",
		},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	// auth (hardcoded)
	r.Post("/auth/login", api.Login)
	r.Get("/auth/me", api.Me)
	r.Get("/auth/resolve-user", api.ResolveUserRole)

	// admin
	r.Route("/admin", func(ar chi.Router) {
		ar.Post("/users", api.AdminCreateUser)
		ar.Post("/users/delete", api.AdminDeleteUser)
		ar.Post("/users/discord", api.AdminUpdateUserDiscord)
		ar.Get("/users", api.AdminSearchUsers)

		ar.Get("/supervisors", api.AdminListSupervisors)
		ar.Post("/boards", api.AdminCreateBoard)
		ar.Get("/boards", api.AdminListBoardsByFile)
		ar.Post("/boards/update", api.AdminUpdateBoard)
		ar.Post("/boards/delete", api.AdminDeleteBoard)

		ar.Post("/board-members", api.AdminAddBoardMember)
		ar.Post("/board-members/delete", api.AdminRemoveBoardMember)
		ar.Get("/board-members", api.AdminListBoardMembers)

		ar.Get("/eligible-students", api.AdminEligibleStudents)

		ar.Get("/board", api.AdminGetBoardFull)

		ar.Post("/lists", api.AdminCreateList)
		ar.Post("/lists/update", api.AdminUpdateList)
		ar.Post("/lists/delete", api.AdminDeleteList)
		ar.Post("/cards", api.AdminCreateCard)

		ar.Post("/cards/move", api.AdminMoveCard)
		ar.Post("/cards/reorder", api.AdminReorderCards)
		ar.Get("/card", api.AdminGetCard)
		ar.Put("/card", api.AdminUpdateCard)
		ar.Post("/card/delete", api.AdminDeleteCard)
		ar.Get("/card/full", api.AdminGetCardFull)

		ar.Post("/card/subtasks", api.AdminCreateSubtask)
		ar.Post("/card/subtasks/toggle", api.AdminToggleSubtask)
		ar.Post("/card/subtasks/delete", api.AdminDeleteSubtask)
		ar.Post("/card/subtasks/update", api.AdminUpdateSubtask)

		ar.Post("/card/assignees/add", api.AdminAddAssignee)
		ar.Post("/card/assignees/remove", api.AdminRemoveAssignee)

		ar.Post("/labels", api.AdminCreateLabel)
		ar.Get("/labels", api.AdminListLabels)
		ar.Post("/labels/update", api.AdminUpdateLabel)
		ar.Post("/labels/delete", api.AdminDeleteLabel)

		ar.Post("/card/labels/add", api.AdminAddCardLabel)
		ar.Post("/card/labels/remove", api.AdminRemoveCardLabel)

		ar.Post("/card/comments", api.AdminAddComment)
		ar.Put("/card/comments", api.AdminUpdateComment)
		ar.Post("/card/comments/delete", api.AdminDeleteComment)

		ar.Post("/card/attachments/upload", api.AdminUploadAttachment)
		ar.Get("/card/attachments/download", api.AdminDownloadAttachment)
		ar.Post("/card/attachments/delete", api.AdminDeleteAttachment)

		ar.Post("/card/reminders", api.AdminCreateReminder)
		ar.Post("/card/reminders/delete", api.AdminDeleteReminder)

		ar.Get("/all-boards", api.AdminAllBoards)
		ar.Get("/profile/summary", api.ProfileSummary)

		// supervisor-student assignments
		ar.Get("/assign/supervisors", api.AdminAssignListSupervisors)
		ar.Get("/assign/students", api.AdminAssignListStudents)
		ar.Get("/assign/list", api.AdminAssignList)
		ar.Post("/assign", api.AdminAssignAdd)
		ar.Post("/assign/remove", api.AdminAssignRemove)
		ar.Get("/eligible-users", api.AdminEligibleUsers)
		ar.Get("/users/exists", api.AdminUserExists)

	})

	// supervisor
	r.Route("/supervisor", func(sr chi.Router) {
		sr.Get("/board-members", api.AdminListBoardMembers)
		sr.Post("/board-members", api.SupervisorAddBoardMember)
		sr.Get("/eligible-students", api.SupervisorEligibleStudents)
	})

	log.Println("API running on http://localhost:" + port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func runMigrations(conn *sql.DB) error {
	files := []string{
		"migrations/001_init.sql",
		"migrations/002_activity.sql",
		"migrations/003_card_meta.sql",
		"migrations/004_comments_attachments_reminders.sql",
		"migrations/005_supervisor_assignments.sql",
		"migrations/007_discord.sql",
		"migrations/008_discord_due_notifications.sql",
		"migrations/009_discord_managed_users.sql",
		// "migrations/006_users_nickname_cohort.sql",
	}

	for _, f := range files {
		if f == "migrations/007_discord.sql" {
			if err := ensureDiscordSchema(conn); err != nil {
				return err
			}
			continue
		}
		if f == "migrations/008_discord_due_notifications.sql" {
			if _, err := conn.Exec(`
				CREATE TABLE IF NOT EXISTS discord_due_notifications (
				  id INTEGER PRIMARY KEY AUTOINCREMENT,
				  card_id INTEGER NOT NULL,
				  user_id INTEGER NOT NULL,
				  days_before INTEGER NOT NULL,
				  due_date TEXT NOT NULL,
				  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
				  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
				  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				  UNIQUE(card_id, user_id, days_before, due_date)
				)
			`); err != nil {
				return err
			}
			continue
		}
		if f == "migrations/009_discord_managed_users.sql" {
			if _, err := conn.Exec(`
				CREATE TABLE IF NOT EXISTS board_discord_managed_users (
				  board_id INTEGER NOT NULL,
				  discord_user_id TEXT NOT NULL,
				  created_at TEXT NOT NULL DEFAULT (datetime('now')),
				  PRIMARY KEY (board_id, discord_user_id),
				  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
				)
			`); err != nil {
				return err
			}
			continue
		}
		sqlBytes, err := os.ReadFile(f)
		if err != nil {
			return err
		}
		if _, err := conn.Exec(string(sqlBytes)); err != nil {
			return err
		}
	}
	return nil
}

func ensureDiscordSchema(conn *sql.DB) error {
	hasColumn, err := sqliteColumnExists(conn, "users", "discord_user_id")
	if err != nil {
		return err
	}
	if !hasColumn {
		if _, err := conn.Exec(`ALTER TABLE users ADD COLUMN discord_user_id TEXT`); err != nil {
			return err
		}
	}

	if _, err := conn.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_user_id
		ON users(discord_user_id)
		WHERE discord_user_id IS NOT NULL AND TRIM(discord_user_id) <> ''
	`); err != nil {
		return err
	}

	if _, err := conn.Exec(`
		CREATE TABLE IF NOT EXISTS board_discord_channels (
		  board_id INTEGER PRIMARY KEY,
		  channel_id TEXT NOT NULL UNIQUE,
		  created_at TEXT NOT NULL DEFAULT (datetime('now')),
		  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
		)
	`); err != nil {
		return err
	}

	return nil
}

func sqliteColumnExists(conn *sql.DB, tableName, columnName string) (bool, error) {
	rows, err := conn.Query("PRAGMA table_info(" + tableName + ")")
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid        int
			name       string
			columnType string
			notNull    int
			defaultVal any
			pk         int
		)
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &pk); err != nil {
			return false, err
		}
		if name == columnName {
			return true, nil
		}
	}

	return false, rows.Err()
}
