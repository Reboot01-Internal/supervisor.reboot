package models

type User struct {
	ID        int64  `json:"id"`
	FullName  string `json:"full_name"`
	Email     string `json:"email"`
	Role      string `json:"role"` // admin|supervisor|student
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
	Nickname  string `json:"nickname"`
	Cohort    string `json:"cohort"`
}

type SupervisorRow struct {
	SupervisorUserID int64  `json:"supervisor_user_id"`
	FullName         string `json:"full_name"`
	Email            string `json:"email"`
	Nickname         string `json:"nickname"`
	Cohort           string `json:"cohort"`
	FileID           int64  `json:"file_id"`
	CreatedAt        string `json:"created_at"`
}
type Board struct {
	ID               int64  `json:"id"`
	SupervisorFileID int64  `json:"supervisor_file_id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	CreatedBy        int64  `json:"created_by"`
	CreatedAt        string `json:"created_at"`
}

type BoardMember struct {
	UserID        int64  `json:"user_id"`
	FullName      string `json:"full_name"`
	Email         string `json:"email"`
	Role          string `json:"role"` // admin/supervisor/student
	Nickname      string `json:"nickname"`
	Cohort        string `json:"cohort"`
	DiscordUserID string `json:"discord_user_id,omitempty"`
	RoleInBoard   string `json:"role_in_board"`
	AddedAt       string `json:"added_at"`
}

type BoardDiscordMember struct {
	UserID        int64  `json:"user_id"`
	FullName      string `json:"full_name"`
	Nickname      string `json:"nickname"`
	DiscordUserID string `json:"discord_user_id"`
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
	Status      string `json:"status"`   // todo|doing|blocked|done
	Priority    string `json:"priority"` // low|medium|high|urgent
	Position    int64  `json:"position"`
	CreatedAt   string `json:"created_at"`
}

type Label struct {
	ID        int64  `json:"id"`
	BoardID   int64  `json:"board_id"`
	Name      string `json:"name"`
	Color     string `json:"color"` // token like 'indigo', 'rose'...
	CreatedAt string `json:"created_at"`
}

type CardLabel struct {
	LabelID int64  `json:"label_id"`
	Name    string `json:"name"`
	Color   string `json:"color"`
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

type CardComment struct {
	ID          int64  `json:"id"`
	CardID      int64  `json:"card_id"`
	ActorUserID int64  `json:"actor_user_id"`
	ActorName   string `json:"actor_name"`
	Body        string `json:"body"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type CardAttachment struct {
	ID             int64  `json:"id"`
	CardID         int64  `json:"card_id"`
	UploaderUserID int64  `json:"uploader_user_id"`
	UploaderName   string `json:"uploader_name"`
	OriginalName   string `json:"original_name"`
	StoredName     string `json:"stored_name"`
	MimeType       string `json:"mime_type"`
	SizeBytes      int64  `json:"size_bytes"`
	CreatedAt      string `json:"created_at"`
}

type CardReminder struct {
	ID        int64  `json:"id"`
	CardID    int64  `json:"card_id"`
	UserID    int64  `json:"user_id"`
	RemindAt  string `json:"remind_at"`
	IsSent    bool   `json:"is_sent"`
	CreatedAt string `json:"created_at"`
}

type Meeting struct {
	ID            int64  `json:"id"`
	BoardID       int64  `json:"board_id"`
	BoardName     string `json:"board_name"`
	SupervisorID  int64  `json:"supervisor_id"`
	Supervisor    string `json:"supervisor_name"`
	CreatedBy     int64  `json:"created_by"`
	CreatedByName string `json:"created_by_name"`
	Title         string `json:"title"`
	Location      string `json:"location"`
	Notes         string `json:"notes"`
	Status        string `json:"status"`
	OutcomeNotes  string `json:"outcome_notes"`
	StartsAt      string `json:"starts_at"`
	EndsAt        string `json:"ends_at"`
	CreatedAt     string `json:"created_at"`
}

type MeetingParticipant struct {
	MeetingID         int64  `json:"meeting_id"`
	UserID            int64  `json:"user_id"`
	FullName          string `json:"full_name"`
	Nickname          string `json:"nickname"`
	Email             string `json:"email"`
	Role              string `json:"role"`
	RoleInBoard       string `json:"role_in_board"`
	RSVPStatus        string `json:"rsvp_status"`
	AttendanceStatus  string `json:"attendance_status"`
	UpdatedAt         string `json:"updated_at"`
}

type AppNotification struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Link      string `json:"link"`
	IsRead    bool   `json:"is_read"`
	CreatedAt string `json:"created_at"`
}

type MeetingRoomNotification struct {
	MeetingID  int64  `json:"meeting_id"`
	BoardID    int64  `json:"board_id"`
	BoardName  string `json:"board_name"`
	Title      string `json:"title"`
	Location   string `json:"location"`
	StartsAt   string `json:"starts_at"`
	EndsAt     string `json:"ends_at"`
}

type DiscordDueNotification struct {
	CardID        int64  `json:"card_id"`
	CardTitle     string `json:"card_title"`
	DueDate       string `json:"due_date"`
	CardStatus    string `json:"card_status"`
	BoardID       int64  `json:"board_id"`
	BoardName     string `json:"board_name"`
	ChannelID     string `json:"channel_id"`
	UserID        int64  `json:"user_id"`
	UserFullName  string `json:"user_full_name"`
	UserNickname  string `json:"user_nickname"`
	DiscordUserID string `json:"discord_user_id"`
}

type BoardFull struct {
	BoardID int64  `json:"board_id"`
	FileID  int64  `json:"supervisor_file_id"`
	Name    string `json:"name"`

	Lists  []List  `json:"lists"`
	Cards  []Card  `json:"cards"`
	Labels []Label `json:"labels"`
}

type CardFull struct {
	Card        Card             `json:"card"`
	Subtasks    []CardSubtask    `json:"subtasks"`
	Assignees   []CardAssignee   `json:"assignees"`
	Activities  []CardActivity   `json:"activities"`
	Labels      []CardLabel      `json:"labels"`
	Comments    []CardComment    `json:"comments"`
	Attachments []CardAttachment `json:"attachments"`
	Reminders   []CardReminder   `json:"reminders"`
	BoardID     int64            `json:"board_id"`
}
