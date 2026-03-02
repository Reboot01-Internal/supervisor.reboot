package models

type User struct {
	ID        int64  `json:"id"`
	FullName  string `json:"full_name"`
	Email     string `json:"email"`
	Role      string `json:"role"` // admin|supervisor|student
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

type SupervisorRow struct {
	SupervisorUserID int64  `json:"supervisor_user_id"`
	FullName         string `json:"full_name"`
	Email            string `json:"email"`
	FileID           int64  `json:"file_id"`
	CreatedAt        string `json:"created_at"`
}
type Board struct {
	ID             int64  `json:"id"`
	SupervisorFileID int64 `json:"supervisor_file_id"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	CreatedBy      int64  `json:"created_by"`
	CreatedAt      string `json:"created_at"`
}

type BoardMember struct {
	UserID      int64  `json:"user_id"`
	FullName    string `json:"full_name"`
	Email       string `json:"email"`
	Role        string `json:"role"` // admin/supervisor/student
	RoleInBoard string `json:"role_in_board"`
	AddedAt     string `json:"added_at"`
}
type List struct {
	ID        int64  `json:"id"`
	BoardID   int64  `json:"board_id"`
	Title     string `json:"title"`
	Position  int64  `json:"position"`
	CreatedAt string `json:"created_at"`
}

type Card struct {
	ID          int64  `json:"id"`
	ListID      int64  `json:"list_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	DueDate     string `json:"due_date"` 
	Position    int64  `json:"position"`
	CreatedAt   string `json:"created_at"`
}

type BoardFull struct {
	BoardID int64  `json:"board_id"`
	FileID  int64  `json:"supervisor_file_id"`
	Name    string `json:"name"`

	Lists []List `json:"lists"`
	Cards []Card `json:"cards"`
}
type CardSubtask struct {
	ID        int64  `json:"id"`
	CardID    int64  `json:"card_id"`
	Title     string `json:"title"`
	IsDone    bool   `json:"is_done"`
	DueDate   string `json:"due_date"`
	Position  int64  `json:"position"`
	CreatedAt string `json:"created_at"`
}

type CardAssignee struct {
	UserID   int64  `json:"user_id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

type CardFull struct {
	Card      Card           `json:"card"`
	Subtasks  []CardSubtask  `json:"subtasks"`
	Assignees []CardAssignee `json:"assignees"`
	BoardID   int64          `json:"board_id"`
}