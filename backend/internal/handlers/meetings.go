package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"taskflow/internal/db"
	"taskflow/internal/models"
	"taskflow/internal/utils"
)

const appMeetingTimezone = "Asia/Bahrain"

func meetingLocation() *time.Location {
	location, err := time.LoadLocation(appMeetingTimezone)
	if err != nil {
		return time.UTC
	}
	return location
}

func (a *API) notifyMeetingParticipants(meetingID, actorID int64, kind, title, meetingTitle, body string) {
	participants, err := db.ListMeetingParticipants(a.conn, meetingID)
	if err != nil {
		return
	}
	for _, participant := range participants {
		if participant.UserID == actorID {
			continue
		}
		_ = db.CreateNotification(
			a.conn,
			participant.UserID,
			kind,
			title,
			strings.TrimSpace(meetingTitle)+": "+strings.TrimSpace(body),
			"/calendar",
		)
	}
}

func (a *API) notifyAdmins(kind, title, body string) {
	admins, err := db.SearchUsersByRole(a.conn, "admin", "")
	if err != nil {
		return
	}
	for _, admin := range admins {
		_ = db.CreateNotification(a.conn, admin.ID, kind, title, body, "/notifications")
	}
}

func (a *API) adminActorLabel(actorID int64) string {
	if actorID <= 0 {
		return "Someone"
	}
	if name, err := db.GetUserDisplayName(a.conn, actorID); err == nil && strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	fullName, _, _, _, err := db.GetUserBasic(a.conn, actorID)
	if err == nil && strings.TrimSpace(fullName) != "" {
		return strings.TrimSpace(fullName)
	}
	return "Someone"
}

func meetingAdminBody(meeting models.Meeting, actorLabel, detail string) string {
	body := fmt.Sprintf("%s in %s for %s.", strings.TrimSpace(meeting.Title), strings.TrimSpace(meeting.BoardName), formatTimeRangeForNotification(meeting.StartsAt, meeting.EndsAt))
	if strings.TrimSpace(meeting.Location) != "" {
		body += " Location: " + strings.TrimSpace(meeting.Location) + "."
	}
	if strings.TrimSpace(actorLabel) != "" {
		body += " By: " + strings.TrimSpace(actorLabel) + "."
	}
	if strings.TrimSpace(detail) != "" {
		body += " " + strings.TrimSpace(detail)
	}
	return body
}

func formatTimeRangeForNotification(startISO, endISO string) string {
	start := strings.TrimSpace(startISO)
	end := strings.TrimSpace(endISO)
	startAt, err := time.Parse(time.RFC3339, start)
	if err != nil {
		return start
	}
	location := meetingLocation()
	endAt, err := time.Parse(time.RFC3339, end)
	if err != nil {
		return startAt.In(location).Format("02 Jan 2006 3:04 PM")
	}
	return fmt.Sprintf("%s - %s", startAt.In(location).Format("02 Jan 2006 3:04 PM"), endAt.In(location).Format("3:04 PM"))
}

type createMeetingReq struct {
	MeetingID int64  `json:"meeting_id"`
	BoardID   int64  `json:"board_id"`
	Title     string `json:"title"`
	Location  string `json:"location"`
	Notes     string `json:"notes"`
	StartsAt  string `json:"starts_at"`
	EndsAt    string `json:"ends_at"`
}

type deleteMeetingReq struct {
	MeetingID int64 `json:"meeting_id"`
}

type updateMeetingStatusReq struct {
	MeetingID    int64  `json:"meeting_id"`
	Status       string `json:"status"`
	OutcomeNotes string `json:"outcome_notes"`
}

type updateMeetingParticipantReq struct {
	MeetingID        int64  `json:"meeting_id"`
	UserID           int64  `json:"user_id"`
	RSVPStatus       string `json:"rsvp_status"`
	AttendanceStatus string `json:"attendance_status"`
}

func normalizeRole(v string) string {
	role := strings.TrimSpace(strings.ToLower(v))
	if role == "" {
		return "admin"
	}
	return role
}

func normalizeMeetingStatus(v string) string {
	status := strings.ToLower(strings.TrimSpace(v))
	switch status {
	case "", "scheduled":
		return "scheduled"
	case "completed", "canceled":
		return status
	default:
		return ""
	}
}

func normalizeRSVPStatus(v string) string {
	status := strings.ToLower(strings.TrimSpace(v))
	switch status {
	case "", "pending":
		return "pending"
	case "going", "maybe", "cant":
		return status
	default:
		return ""
	}
}

func normalizeAttendanceStatus(v string) string {
	status := strings.ToLower(strings.TrimSpace(v))
	switch status {
	case "", "pending":
		return "pending"
	case "attended", "late", "missed":
		return status
	default:
		return ""
	}
}

func parseMeetingTime(raw string) (string, time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", time.Time{}, errors.New("empty time")
	}

	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return "", time.Time{}, err
	}
	return t.UTC().Format(time.RFC3339), t.UTC(), nil
}

func (a *API) authorizeMeetingAccess(role string, actor int64, meetingID int64) (int64, error) {
	meeting, err := db.GetMeetingByID(a.conn, meetingID)
	if err != nil {
		return 0, err
	}
	switch role {
	case "admin":
		return meeting.BoardID, nil
	case "supervisor":
		if actor != meeting.SupervisorID {
			return 0, errors.New("forbidden")
		}
		return meeting.BoardID, nil
	case "student":
		ok, err := db.IsBoardMember(a.conn, meeting.BoardID, actor)
		if err != nil {
			return 0, err
		}
		if !ok {
			return 0, errors.New("forbidden")
		}
		return meeting.BoardID, nil
	default:
		return 0, errors.New("forbidden")
	}
}

func (a *API) validateMeetingWrite(role string, actor int64, req createMeetingReq) (string, string, int64, error) {
	req.Title = strings.TrimSpace(req.Title)
	req.Location = normalizeMeetingRoomLabel(req.Location)
	req.Notes = strings.TrimSpace(req.Notes)
	if req.BoardID == 0 || req.Title == "" || req.StartsAt == "" || req.EndsAt == "" {
		return "", "", 0, errors.New("board_id, title, starts_at and ends_at required")
	}

	startsAt, startTime, err := parseMeetingTime(req.StartsAt)
	if err != nil {
		return "", "", 0, errors.New("invalid starts_at")
	}
	endsAt, endTime, err := parseMeetingTime(req.EndsAt)
	if err != nil {
		return "", "", 0, errors.New("invalid ends_at")
	}
	if !endTime.After(startTime) {
		return "", "", 0, errors.New("end time must be after start time")
	}

	if _, err := db.GetBoardBasic(a.conn, req.BoardID); err != nil {
		return "", "", 0, errors.New("board not found")
	}

	boardSupervisorID, err := db.GetBoardSupervisorUserID(a.conn, req.BoardID)
	if err != nil || boardSupervisorID == 0 {
		return "", "", 0, errors.New("board has no supervisor")
	}
	if role == "supervisor" && actor != boardSupervisorID {
		return "", "", 0, errors.New("can only schedule meetings for your own boards")
	}

	if config, ok := meetingLocationConfig(req.Location); req.Location != "" && !ok {
		return "", "", 0, errors.New("invalid location")
	} else if ok && config.BlocksRoomSlot {
		conflicts, err := db.CountMeetingLocationConflicts(a.conn, req.MeetingID, req.Location, startsAt, endsAt)
		if err != nil {
			return "", "", 0, errors.New("failed to check room conflicts")
		}
		if conflicts > 0 {
			return "", "", 0, errors.New("location is already booked during that time")
		}
	}

	return startsAt, endsAt, boardSupervisorID, nil
}

func (a *API) AdminListMeetings(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" && role != "student" {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}

	meetings, err := db.ListMeetings(a.conn, role, actorID(r, a.conn))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, meetings)
}

func (a *API) AdminListMeetingParticipants(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	actor := actorID(r, a.conn)
	meetingID, err := parseInt64Query(r, "meeting_id")
	if err != nil || meetingID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid meeting_id")
		return
	}

	if _, err := a.authorizeMeetingAccess(role, actor, meetingID); err != nil {
		if err.Error() == "forbidden" {
			writeErr(w, http.StatusForbidden, "forbidden")
			return
		}
		writeErr(w, http.StatusNotFound, "meeting not found")
		return
	}

	items, err := db.ListMeetingParticipants(a.conn, meetingID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func parseInt64Query(r *http.Request, key string) (int64, error) {
	return strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get(key)), 10, 64)
}

func escapeICSField(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, "\n", `\n`)
	v = strings.ReplaceAll(v, ",", `\,`)
	v = strings.ReplaceAll(v, ";", `\;`)
	return v
}

func icsDateTime(raw string) string {
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	return t.UTC().Format("20060102T150405Z")
}

func buildMeetingsICS(meetings []models.Meeting) string {
	now := time.Now().UTC().Format("20060102T150405Z")
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString("PRODID:-//TaskFlow//Meetings//EN\r\n")
	b.WriteString("CALSCALE:GREGORIAN\r\n")
	b.WriteString("METHOD:PUBLISH\r\n")
	for _, meeting := range meetings {
		start := icsDateTime(meeting.StartsAt)
		end := icsDateTime(meeting.EndsAt)
		if start == "" || end == "" {
			continue
		}
		descParts := []string{}
		if strings.TrimSpace(meeting.Notes) != "" {
			descParts = append(descParts, "Agenda: "+strings.TrimSpace(meeting.Notes))
		}
		if strings.TrimSpace(meeting.OutcomeNotes) != "" {
			descParts = append(descParts, "Outcome notes: "+strings.TrimSpace(meeting.OutcomeNotes))
		}
		descParts = append(descParts, "Board: "+strings.TrimSpace(meeting.BoardName))
		descParts = append(descParts, "Status: "+strings.TrimSpace(meeting.Status))

		b.WriteString("BEGIN:VEVENT\r\n")
		b.WriteString(fmt.Sprintf("UID:meeting-%d@taskflow\r\n", meeting.ID))
		b.WriteString("DTSTAMP:" + now + "\r\n")
		b.WriteString("DTSTART:" + start + "\r\n")
		b.WriteString("DTEND:" + end + "\r\n")
		b.WriteString("SUMMARY:" + escapeICSField(meeting.Title) + "\r\n")
		if strings.TrimSpace(meeting.Location) != "" {
			b.WriteString("LOCATION:" + escapeICSField(meeting.Location) + "\r\n")
		}
		b.WriteString("DESCRIPTION:" + escapeICSField(strings.Join(descParts, "\n")) + "\r\n")
		if meeting.Status == "canceled" {
			b.WriteString("STATUS:CANCELLED\r\n")
		} else {
			b.WriteString("STATUS:CONFIRMED\r\n")
		}
		b.WriteString("END:VEVENT\r\n")
	}
	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

func (a *API) AdminCreateMeeting(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can create meetings")
		return
	}

	var req createMeetingReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	actor := actorID(r, a.conn)
	startsAt, endsAt, _, err := a.validateMeetingWrite(role, actor, req)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	meetingID, err := db.CreateMeeting(a.conn, req.BoardID, actor, req.Title, req.Location, req.Notes, startsAt, endsAt)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to create meeting")
		return
	}
	_ = db.SyncMeetingParticipants(a.conn, meetingID, req.BoardID)
	meeting, _ := db.GetMeetingByID(a.conn, meetingID)
	a.notifyMeetingParticipants(meetingID, actor, "meeting_created", "New meeting booked", meeting.Title, "A new meeting was added to your board calendar.")
	a.notifyAdmins("meeting_created", "New meeting booked", meetingAdminBody(meeting, a.adminActorLabel(actor), "Meeting was booked."))

	discordNotified := a.notifyMeetingBooked(meetingID, actor)
	roomBookingNotified := a.notifyMeetingRoomBookingIfDue(meetingID)

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":                    meetingID,
		"discord_notified":      discordNotified,
		"room_booking_notified": roomBookingNotified,
	})
}

func (a *API) ExportMeetingsCalendar(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" && role != "student" {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}

	meetings, err := db.ListMeetings(a.conn, role, actorID(r, a.conn))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	boardID, _ := parseInt64Query(r, "board_id")
	if boardID > 0 {
		filtered := make([]models.Meeting, 0, len(meetings))
		for _, meeting := range meetings {
			if meeting.BoardID == boardID {
				filtered = append(filtered, meeting)
			}
		}
		meetings = filtered
	}

	filename := "taskflow-meetings.ics"
	if role == "student" {
		filename = "taskflow-my-calendar.ics"
	} else if role == "supervisor" {
		filename = "taskflow-my-meetings.ics"
	}

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(buildMeetingsICS(meetings)))
}

func (a *API) AdminUpdateMeeting(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can edit meetings")
		return
	}

	var req createMeetingReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.MeetingID == 0 {
		writeErr(w, http.StatusBadRequest, "meeting_id required")
		return
	}

	existing, err := db.GetMeetingByID(a.conn, req.MeetingID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "meeting not found")
		return
	}

	actor := actorID(r, a.conn)
	if role == "supervisor" && actor != existing.SupervisorID {
		writeErr(w, http.StatusForbidden, "can only edit meetings for your own boards")
		return
	}

	startsAt, endsAt, _, err := a.validateMeetingWrite(role, actor, req)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := db.UpdateMeeting(a.conn, req.MeetingID, req.BoardID, req.Title, req.Location, req.Notes, startsAt, endsAt); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to update meeting")
		return
	}
	_ = db.SyncMeetingParticipants(a.conn, req.MeetingID, req.BoardID)
	updatedMeeting, _ := db.GetMeetingByID(a.conn, req.MeetingID)
	a.notifyMeetingParticipants(req.MeetingID, actor, "meeting_updated", "Meeting rescheduled", updatedMeeting.Title, "A meeting time, room, or agenda was updated.")
	a.notifyAdmins("meeting_updated", "Meeting rescheduled", meetingAdminBody(updatedMeeting, a.adminActorLabel(actor), "The schedule, room, or agenda was changed."))
	_ = a.notifyMeetingChanged(updatedMeeting, "updated")

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminUpdateMeetingStatus(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can update meeting status")
		return
	}

	var req updateMeetingStatusReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.MeetingID == 0 {
		writeErr(w, http.StatusBadRequest, "meeting_id required")
		return
	}

	meeting, err := db.GetMeetingByID(a.conn, req.MeetingID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "meeting not found")
		return
	}

	actor := actorID(r, a.conn)
	if role == "supervisor" && actor != meeting.SupervisorID {
		writeErr(w, http.StatusForbidden, "can only update meetings for your own boards")
		return
	}

	status := normalizeMeetingStatus(req.Status)
	if status == "" {
		writeErr(w, http.StatusBadRequest, "invalid status")
		return
	}

	if err := db.UpdateMeetingStatus(a.conn, req.MeetingID, status, req.OutcomeNotes); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to update meeting status")
		return
	}
	updatedMeeting, _ := db.GetMeetingByID(a.conn, req.MeetingID)
	title := "Meeting updated"
	body := "A meeting status changed."
	switch status {
	case "completed":
		title = "Meeting completed"
		body = "A meeting was marked complete and outcomes were posted."
	case "canceled":
		title = "Meeting canceled"
		body = "A meeting was canceled."
	}
	a.notifyMeetingParticipants(req.MeetingID, actor, "meeting_status", title, updatedMeeting.Title, body)
	adminDetail := body
	if strings.TrimSpace(req.OutcomeNotes) != "" {
		adminDetail += " Notes: " + strings.TrimSpace(req.OutcomeNotes)
	}
	a.notifyAdmins("meeting_status", title, meetingAdminBody(updatedMeeting, a.adminActorLabel(actor), adminDetail))
	verb := "updated"
	if status == "completed" {
		verb = "completed"
	} else if status == "canceled" {
		verb = "canceled"
	}
	_ = a.notifyMeetingChanged(updatedMeeting, verb)

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminUpdateMeetingParticipant(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" && role != "student" {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}

	var req updateMeetingParticipantReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.MeetingID == 0 || req.UserID == 0 {
		writeErr(w, http.StatusBadRequest, "meeting_id and user_id required")
		return
	}

	meeting, err := db.GetMeetingByID(a.conn, req.MeetingID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "meeting not found")
		return
	}

	actor := actorID(r, a.conn)
	if role == "supervisor" && actor != meeting.SupervisorID {
		writeErr(w, http.StatusForbidden, "can only update meetings for your own boards")
		return
	}
	if role == "student" && actor != req.UserID {
		writeErr(w, http.StatusForbidden, "can only update your own RSVP")
		return
	}

	rsvp := normalizeRSVPStatus(req.RSVPStatus)
	attendance := normalizeAttendanceStatus(req.AttendanceStatus)
	if rsvp == "" || attendance == "" {
		writeErr(w, http.StatusBadRequest, "invalid participant status")
		return
	}
	if role == "student" {
		attendance = "pending"
	}

	if err := db.UpdateMeetingParticipant(a.conn, req.MeetingID, req.UserID, rsvp, attendance); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to update meeting participant")
		return
	}

	participantName := "Participant"
	if name, err := db.GetUserDisplayName(a.conn, req.UserID); err == nil && strings.TrimSpace(name) != "" {
		participantName = strings.TrimSpace(name)
	}
	detail := fmt.Sprintf("%s updated RSVP to %s", participantName, rsvp)
	if role != "student" {
		detail += fmt.Sprintf(" and attendance to %s", attendance)
	}
	detail += "."
	a.notifyAdmins("meeting_participant", "Meeting participant updated", meetingAdminBody(meeting, a.adminActorLabel(actor), detail))

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminDeleteMeeting(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can delete meetings")
		return
	}

	var req deleteMeetingReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.MeetingID == 0 {
		writeErr(w, http.StatusBadRequest, "meeting_id required")
		return
	}

	meeting, err := db.GetMeetingByID(a.conn, req.MeetingID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "meeting not found")
		return
	}

	actor := actorID(r, a.conn)
	if role == "supervisor" && actor != meeting.SupervisorID {
		writeErr(w, http.StatusForbidden, "can only delete meetings for your own boards")
		return
	}

	if err := db.DeleteMeeting(a.conn, req.MeetingID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to delete meeting")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
