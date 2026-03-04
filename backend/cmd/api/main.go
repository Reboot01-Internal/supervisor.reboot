package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	_ "github.com/mattn/go-sqlite3"
	"github.com/joho/godotenv"

	"taskflow/internal/db"
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

	api := handlers.NewAPI(conn)

	r := chi.NewRouter()

	// ✅ CORS FIX
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{
			"http://localhost:5173",
			"http://127.0.0.1:5173",
		},
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

	// admin
	r.Route("/admin", func(ar chi.Router) {
		ar.Post("/users", api.AdminCreateUser)
		ar.Get("/users", api.AdminSearchUsers)

		ar.Get("/supervisors", api.AdminListSupervisors)
		ar.Post("/boards", api.AdminCreateBoard)
		ar.Get("/boards", api.AdminListBoardsByFile)

		ar.Post("/board-members", api.AdminAddBoardMember)
		ar.Get("/board-members", api.AdminListBoardMembers)

		ar.Get("/eligible-students", api.AdminEligibleStudents)

		ar.Get("/board", api.AdminGetBoardFull)

		ar.Post("/lists", api.AdminCreateList)
		ar.Post("/cards", api.AdminCreateCard)

		ar.Post("/cards/move", api.AdminMoveCard)
		ar.Post("/cards/reorder", api.AdminReorderCards)
		ar.Get("/card", api.AdminGetCard)
		ar.Put("/card", api.AdminUpdateCard)
		ar.Get("/card/full", api.AdminGetCardFull)

		ar.Post("/card/subtasks", api.AdminCreateSubtask)
		ar.Post("/card/subtasks/toggle", api.AdminToggleSubtask)
		ar.Post("/card/subtasks/delete", api.AdminDeleteSubtask)

		ar.Post("/card/assignees/add", api.AdminAddAssignee)
		ar.Post("/card/assignees/remove", api.AdminRemoveAssignee)

		ar.Post("/labels", api.AdminCreateLabel)
		ar.Get("/labels", api.AdminListLabels)

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

		// supervisor-student assignments
		ar.Get("/assign/supervisors", api.AdminAssignListSupervisors)
		ar.Get("/assign/students", api.AdminAssignListStudents)
		ar.Get("/assign/list", api.AdminAssignList)
		ar.Post("/assign", api.AdminAssignAdd)
		ar.Post("/assign/remove", api.AdminAssignRemove)
		ar.Get("/eligible-users", api.AdminEligibleUsers)
	})

	// supervisor
	r.Route("/supervisor", func(sr chi.Router) {
		sr.Get("/board-members", api.AdminListBoardMembers)
		sr.Post("/board-members", api.SupervisorAddBoardMember)
		sr.Get("/eligible-students", api.SupervisorEligibleStudents)
	})

	log.Println("API running on http://localhost:" + port)
	log.Println("Hardcoded login enabled (NO JWT)")
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func runMigrations(conn *sql.DB) error {
	files := []string{
		"migrations/001_init.sql",
		"migrations/002_activity.sql",
		"migrations/003_card_meta.sql",
		"migrations/004_comments_attachments_reminders.sql",
		"migrations/005_supervisor_assignments.sql",
	}

	for _, f := range files {
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