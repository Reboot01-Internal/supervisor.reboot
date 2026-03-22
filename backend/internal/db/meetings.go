package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func CreateMeeting(conn *sql.DB, boardID, createdBy int64, title, location, notes, startsAt, endsAt string) (int64, error) {
	title = strings.TrimSpace(title)
	location = strings.TrimSpace(location)
	notes = strings.TrimSpace(notes)
	startsAt = strings.TrimSpace(startsAt)
	endsAt = strings.TrimSpace(endsAt)

	res, err := conn.Exec(`
		INSERT INTO meetings (board_id, created_by, title, location, notes, starts_at, ends_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, boardID, createdBy, title, location, notes, startsAt, endsAt)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func GetMeetingByID(conn *sql.DB, meetingID int64) (models.Meeting, error) {
	var meeting models.Meeting
	err := conn.QueryRow(`
		SELECT
			m.id,
			m.board_id,
			b.name,
			sf.supervisor_user_id,
			su.full_name,
			m.created_by,
			cu.full_name,
			m.title,
			m.location,
			IFNULL(m.notes, ''),
			LOWER(TRIM(COALESCE(m.status, 'scheduled'))),
			IFNULL(m.outcome_notes, ''),
			m.starts_at,
			m.ends_at,
			m.created_at
		FROM meetings m
		JOIN boards b ON b.id = m.board_id
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		JOIN users su ON su.id = sf.supervisor_user_id
		JOIN users cu ON cu.id = m.created_by
		WHERE m.id = ?
	`, meetingID).Scan(
		&meeting.ID,
		&meeting.BoardID,
		&meeting.BoardName,
		&meeting.SupervisorID,
		&meeting.Supervisor,
		&meeting.CreatedBy,
		&meeting.CreatedByName,
		&meeting.Title,
		&meeting.Location,
		&meeting.Notes,
		&meeting.Status,
		&meeting.OutcomeNotes,
		&meeting.StartsAt,
		&meeting.EndsAt,
		&meeting.CreatedAt,
	)
	return meeting, err
}

func UpdateMeeting(conn *sql.DB, meetingID, boardID int64, title, location, notes, startsAt, endsAt string) error {
	title = strings.TrimSpace(title)
	location = strings.TrimSpace(location)
	notes = strings.TrimSpace(notes)
	startsAt = strings.TrimSpace(startsAt)
	endsAt = strings.TrimSpace(endsAt)

	_, err := conn.Exec(`
		UPDATE meetings
		SET board_id = ?, title = ?, location = ?, notes = ?, starts_at = ?, ends_at = ?
		WHERE id = ?
	`, boardID, title, location, notes, startsAt, endsAt, meetingID)
	return err
}

func UpdateMeetingStatus(conn *sql.DB, meetingID int64, status, outcomeNotes string) error {
	status = strings.ToLower(strings.TrimSpace(status))
	outcomeNotes = strings.TrimSpace(outcomeNotes)
	_, err := conn.Exec(`
		UPDATE meetings
		SET status = ?, outcome_notes = ?
		WHERE id = ?
	`, status, outcomeNotes, meetingID)
	return err
}

func DeleteMeeting(conn *sql.DB, meetingID int64) error {
	_, err := conn.Exec(`DELETE FROM meetings WHERE id = ?`, meetingID)
	return err
}

func SyncMeetingParticipants(conn *sql.DB, meetingID, boardID int64) error {
	_, err := conn.Exec(`
		INSERT INTO meeting_participants (meeting_id, user_id)
		SELECT ?, bm.user_id
		FROM board_members bm
		WHERE bm.board_id = ?
		ON CONFLICT(meeting_id, user_id) DO NOTHING
	`, meetingID, boardID)
	if err != nil {
		return err
	}

	_, err = conn.Exec(`
		DELETE FROM meeting_participants
		WHERE meeting_id = ?
		  AND user_id NOT IN (
		    SELECT bm.user_id
		    FROM board_members bm
		    WHERE bm.board_id = ?
		  )
	`, meetingID, boardID)
	return err
}

func ListMeetingParticipants(conn *sql.DB, meetingID int64) ([]models.MeetingParticipant, error) {
	rows, err := conn.Query(`
		SELECT
			mp.meeting_id,
			mp.user_id,
			u.full_name,
			IFNULL(u.nickname, ''),
			u.email,
			u.role,
			IFNULL(bm.role_in_board, ''),
			LOWER(TRIM(COALESCE(mp.rsvp_status, 'pending'))),
			LOWER(TRIM(COALESCE(mp.attendance_status, 'pending'))),
			mp.updated_at
		FROM meeting_participants mp
		JOIN users u ON u.id = mp.user_id
		LEFT JOIN meetings m ON m.id = mp.meeting_id
		LEFT JOIN board_members bm ON bm.board_id = m.board_id AND bm.user_id = mp.user_id
		WHERE mp.meeting_id = ?
		ORDER BY
			CASE LOWER(u.role) WHEN 'supervisor' THEN 0 WHEN 'student' THEN 1 ELSE 2 END,
			u.full_name ASC
	`, meetingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.MeetingParticipant{}
	for rows.Next() {
		var item models.MeetingParticipant
		if err := rows.Scan(
			&item.MeetingID,
			&item.UserID,
			&item.FullName,
			&item.Nickname,
			&item.Email,
			&item.Role,
			&item.RoleInBoard,
			&item.RSVPStatus,
			&item.AttendanceStatus,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func UpdateMeetingParticipant(conn *sql.DB, meetingID, userID int64, rsvpStatus, attendanceStatus string) error {
	rsvpStatus = strings.ToLower(strings.TrimSpace(rsvpStatus))
	attendanceStatus = strings.ToLower(strings.TrimSpace(attendanceStatus))
	_, err := conn.Exec(`
		UPDATE meeting_participants
		SET rsvp_status = ?, attendance_status = ?, updated_at = datetime('now')
		WHERE meeting_id = ? AND user_id = ?
	`, rsvpStatus, attendanceStatus, meetingID, userID)
	return err
}

func CountMeetingLocationConflicts(conn *sql.DB, meetingID int64, location, startsAt, endsAt string) (int, error) {
	location = strings.ToLower(strings.TrimSpace(location))
	var count int
	err := conn.QueryRow(`
		SELECT COUNT(1)
		FROM meetings
		WHERE LOWER(TRIM(COALESCE(location, ''))) = ?
		  AND LOWER(TRIM(COALESCE(status, 'scheduled'))) <> 'canceled'
		  AND id <> ?
		  AND starts_at < ?
		  AND ends_at > ?
	`, location, meetingID, endsAt, startsAt).Scan(&count)
	return count, err
}

func ListMeetings(conn *sql.DB, role string, actorID int64) ([]models.Meeting, error) {
	base := `
		SELECT
			m.id,
			m.board_id,
			b.name,
			sf.supervisor_user_id,
			su.full_name,
			m.created_by,
			cu.full_name,
			m.title,
			m.location,
			IFNULL(m.notes, ''),
			LOWER(TRIM(COALESCE(m.status, 'scheduled'))),
			IFNULL(m.outcome_notes, ''),
			m.starts_at,
			m.ends_at,
			m.created_at
		FROM meetings m
		JOIN boards b ON b.id = m.board_id
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		JOIN users su ON su.id = sf.supervisor_user_id
		JOIN users cu ON cu.id = m.created_by
	`

	var (
		rows *sql.Rows
		err  error
	)

	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin":
		rows, err = conn.Query(base + ` ORDER BY m.starts_at ASC, m.id ASC`)
	case "supervisor":
		rows, err = conn.Query(base+`
			WHERE sf.supervisor_user_id = ?
			ORDER BY m.starts_at ASC, m.id ASC
		`, actorID)
	case "student":
		rows, err = conn.Query(base+`
			JOIN board_members bm ON bm.board_id = b.id
			WHERE bm.user_id = ?
			ORDER BY m.starts_at ASC, m.id ASC
		`, actorID)
	default:
		rows, err = conn.Query(base + ` WHERE 1 = 0`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.Meeting{}
	for rows.Next() {
		var meeting models.Meeting
		if err := rows.Scan(
			&meeting.ID,
			&meeting.BoardID,
			&meeting.BoardName,
			&meeting.SupervisorID,
			&meeting.Supervisor,
			&meeting.CreatedBy,
			&meeting.CreatedByName,
			&meeting.Title,
			&meeting.Location,
			&meeting.Notes,
			&meeting.Status,
			&meeting.OutcomeNotes,
			&meeting.StartsAt,
			&meeting.EndsAt,
			&meeting.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, meeting)
	}

	return out, rows.Err()
}
