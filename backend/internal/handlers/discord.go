package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"taskflow/internal/db"
	"taskflow/internal/discord"
	"taskflow/internal/models"
)

const discordSyncTimeout = 30 * time.Second

func (a *API) syncBoardDiscordChannel(boardID int64) bool {
	if a.discord == nil || !a.discord.Enabled() {
		return false
	}

	board, err := db.GetBoardBasic(a.conn, boardID)
	if err != nil {
		log.Printf("discord sync skipped: board %d not found: %v", boardID, err)
		return false
	}

	members, err := db.ListBoardDiscordMembers(a.conn, boardID)
	if err != nil {
		log.Printf("discord sync skipped: board %d members query failed: %v", boardID, err)
		return false
	}

	access := make([]discord.MemberAccess, 0, len(members))
	managedDiscordUserIDs := make([]string, 0, len(members))
	for _, member := range members {
		discordUserID := strings.TrimSpace(member.DiscordUserID)
		if discordUserID == "" && strings.TrimSpace(member.Nickname) != "" {
			resolveCtx, resolveCancel := context.WithTimeout(context.Background(), discordSyncTimeout)
			resolvedID, err := a.discord.ResolveMemberByNickname(resolveCtx, member.Nickname)
			resolveCancel()
			if err != nil {
				log.Printf("discord nickname resolve failed for board %d user %d nickname %q: %v", boardID, member.UserID, member.Nickname, err)
			} else if resolvedID != "" {
				if err := db.UpdateUserDiscordID(a.conn, member.UserID, resolvedID); err != nil {
					log.Printf("discord user id save failed for board %d user %d: %v", boardID, member.UserID, err)
				} else {
					discordUserID = resolvedID
				}
			}
		}
		if discordUserID == "" {
			continue
		}
		managedDiscordUserIDs = append(managedDiscordUserIDs, discordUserID)
		access = append(access, discord.MemberAccess{
			DiscordUserID: discordUserID,
		})
	}

	channelID, err := db.GetBoardDiscordChannelID(a.conn, boardID)
	if err == sql.ErrNoRows {
		createCtx, createCancel := context.WithTimeout(context.Background(), discordSyncTimeout)
		channelID, err = a.discord.CreateBoardChannel(createCtx, board.Name, access)
		createCancel()
		if err != nil {
			log.Printf("discord channel create failed for board %d: %v", boardID, err)
			return false
		}
		if err := db.UpsertBoardDiscordChannel(a.conn, boardID, channelID); err != nil {
			log.Printf("discord channel mapping save failed for board %d: %v", boardID, err)
			return false
		}
		if err := db.ReplaceBoardManagedDiscordUserIDs(a.conn, boardID, managedDiscordUserIDs); err != nil {
			log.Printf("discord managed user save failed for board %d: %v", boardID, err)
			return false
		}
		return true
	}
	if err != nil {
		log.Printf("discord channel lookup failed for board %d: %v", boardID, err)
		return false
	}

	previouslyManagedUserIDs, err := db.ListBoardManagedDiscordUserIDs(a.conn, boardID)
	if err != nil {
		log.Printf("discord managed user lookup failed for board %d: %v", boardID, err)
		return false
	}

	updateCtx, updateCancel := context.WithTimeout(context.Background(), discordSyncTimeout)
	if err := a.discord.UpdateBoardChannel(updateCtx, channelID, board.Name, access, previouslyManagedUserIDs); err != nil {
		updateCancel()
		log.Printf("discord channel update failed for board %d: %v", boardID, err)
		return false
	}
	updateCancel()
	if err := db.ReplaceBoardManagedDiscordUserIDs(a.conn, boardID, managedDiscordUserIDs); err != nil {
		log.Printf("discord managed user save failed for board %d: %v", boardID, err)
		return false
	}
	return true
}

func (a *API) deleteBoardDiscordChannel(boardID int64) error {
	if a.discord == nil || !a.discord.Enabled() {
		return nil
	}

	channelID, err := db.GetBoardDiscordChannelID(a.conn, boardID)
	if err == sql.ErrNoRows || strings.TrimSpace(channelID) == "" {
		return nil
	}
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), discordSyncTimeout)
	defer cancel()

	if err := a.discord.DeleteChannel(ctx, channelID); err != nil {
		if strings.Contains(err.Error(), "status=404") || strings.Contains(err.Error(), fmt.Sprintf("status=%d", http.StatusNotFound)) {
			return nil
		}
		return err
	}
	return nil
}

func (a *API) notifyCardAssigned(cardID, userID, actorID int64) bool {
	if a.discord == nil || !a.discord.Enabled() {
		return false
	}

	boardID, err := db.GetBoardIDByCardID(a.conn, cardID)
	if err != nil || boardID == 0 {
		log.Printf("discord assignment notify skipped: board lookup failed for card %d: %v", cardID, err)
		return false
	}

	_ = a.syncBoardDiscordChannel(boardID)

	channelID, err := db.GetBoardDiscordChannelID(a.conn, boardID)
	if err != nil || strings.TrimSpace(channelID) == "" {
		log.Printf("discord assignment notify skipped: channel lookup failed for board %d: %v", boardID, err)
		return false
	}

	board, err := db.GetBoardBasic(a.conn, boardID)
	if err != nil {
		log.Printf("discord assignment notify skipped: board query failed for board %d: %v", boardID, err)
		return false
	}

	card, err := db.GetCardWithDue(a.conn, cardID)
	if err != nil {
		log.Printf("discord assignment notify skipped: card query failed for card %d: %v", cardID, err)
		return false
	}

	actorName := "Someone"
	actorMention := actorName
	if actorID > 0 {
		if displayName, err := db.GetUserDisplayName(a.conn, actorID); err == nil && strings.TrimSpace(displayName) != "" {
			actorName = displayName
			actorMention = displayName
		}
		actorMention = a.resolveDiscordMention(actorID, actorName)
	}

	assigneeName := "Someone"
	if displayName, err := db.GetUserDisplayName(a.conn, userID); err == nil && strings.TrimSpace(displayName) != "" {
		assigneeName = displayName
	}
	assigneeMention := a.resolveDiscordMention(userID, assigneeName)

	message := fmt.Sprintf("%s assigned %s to **%s** in **%s**.", actorMention, assigneeMention, card.Title, board.Name)
	if strings.TrimSpace(card.DueDate) != "" {
		message += fmt.Sprintf(" Deadline: `%s`.", strings.TrimSpace(card.DueDate))
	}

	ctx, cancel := context.WithTimeout(context.Background(), discordSyncTimeout)
	defer cancel()

	if err := a.discord.SendChannelMessage(ctx, channelID, message); err != nil {
		log.Printf("discord assignment notify failed for card %d user %d: %v", cardID, userID, err)
		return false
	}

	return true
}

func (a *API) notifyCardCompleted(cardID, actorID int64) bool {
	if a.discord == nil || !a.discord.Enabled() {
		return false
	}

	boardID, err := db.GetBoardIDByCardID(a.conn, cardID)
	if err != nil || boardID == 0 {
		log.Printf("discord completion notify skipped: board lookup failed for card %d: %v", cardID, err)
		return false
	}

	channelID, err := db.GetBoardDiscordChannelID(a.conn, boardID)
	if err != nil || strings.TrimSpace(channelID) == "" {
		log.Printf("discord completion notify skipped: channel lookup failed for board %d: %v", boardID, err)
		return false
	}

	board, err := db.GetBoardBasic(a.conn, boardID)
	if err != nil {
		log.Printf("discord completion notify skipped: board query failed for board %d: %v", boardID, err)
		return false
	}

	card, err := db.GetCardWithDue(a.conn, cardID)
	if err != nil {
		log.Printf("discord completion notify skipped: card query failed for card %d: %v", cardID, err)
		return false
	}

	actorName := "Someone"
	actorMention := actorName
	if actorID > 0 {
		if fullName, _, _, _, err := db.GetUserBasic(a.conn, actorID); err == nil && strings.TrimSpace(fullName) != "" {
			actorName = fullName
			actorMention = fullName
		}
		if discordUserID, err := db.GetUserDiscordID(a.conn, actorID); err == nil && strings.TrimSpace(discordUserID) != "" {
			actorMention = "<@" + strings.TrimSpace(discordUserID) + ">"
		}
	}

	messages := []string{
		fmt.Sprintf("%s completed **%s** in **%s**. Great work, keep the momentum going.", actorMention, card.Title, board.Name),
		fmt.Sprintf("%s finished **%s** in **%s**. Strong progress, keep pushing.", actorMention, card.Title, board.Name),
		fmt.Sprintf("%s wrapped up **%s** in **%s**. Nice job, one more step forward.", actorMention, card.Title, board.Name),
	}
	message := messages[(int(cardID)+int(actorID))%len(messages)]

	ctx, cancel := context.WithTimeout(context.Background(), discordSyncTimeout)
	defer cancel()

	if err := a.discord.SendChannelMessage(ctx, channelID, message); err != nil {
		log.Printf("discord completion notify failed for card %d actor %d (%s): %v", cardID, actorID, actorName, err)
		return false
	}

	return true
}

func (a *API) resolveDiscordMention(userID int64, fallback string) string {
	fallback = strings.TrimSpace(fallback)
	if fallback == "" {
		fallback = "Someone"
	}

	if discordUserID, err := db.GetUserDiscordID(a.conn, userID); err == nil && strings.TrimSpace(discordUserID) != "" {
		return "<@" + strings.TrimSpace(discordUserID) + ">"
	}

	if a.discord != nil && a.discord.Enabled() && fallback != "" {
		ctx, cancel := context.WithTimeout(context.Background(), discordSyncTimeout)
		resolvedID, err := a.discord.ResolveMemberByNickname(ctx, fallback)
		cancel()
		if err == nil && strings.TrimSpace(resolvedID) != "" {
			if err := db.UpdateUserDiscordID(a.conn, userID, resolvedID); err != nil {
				log.Printf("discord user id save failed for user %d: %v", userID, err)
			} else {
				return "<@" + strings.TrimSpace(resolvedID) + ">"
			}
		}
	}

	return "@" + strings.TrimPrefix(fallback, "@")
}

func (a *API) notifyMeetingBooked(meetingID, actorID int64) bool {
	if a.discord == nil || !a.discord.Enabled() {
		return false
	}

	meeting, err := db.GetMeetingByID(a.conn, meetingID)
	if err != nil || meeting.ID == 0 {
		log.Printf("discord meeting notify skipped: meeting lookup failed for meeting %d: %v", meetingID, err)
		return false
	}

	_ = a.syncBoardDiscordChannel(meeting.BoardID)

	channelID, err := db.GetBoardDiscordChannelID(a.conn, meeting.BoardID)
	if err != nil || strings.TrimSpace(channelID) == "" {
		log.Printf("discord meeting notify skipped: channel lookup failed for board %d: %v", meeting.BoardID, err)
		return false
	}

	actorName := meeting.CreatedByName
	actorMention := actorName
	if actorID > 0 {
		if displayName, err := db.GetUserDisplayName(a.conn, actorID); err == nil && strings.TrimSpace(displayName) != "" {
			actorName = displayName
			actorMention = displayName
		}
		actorMention = a.resolveDiscordMention(actorID, actorName)
	}
	if strings.TrimSpace(actorName) == "" {
		actorName = "Someone"
	}
	if strings.TrimSpace(actorMention) == "" {
		actorMention = actorName
	}

	startAt, err := time.Parse(time.RFC3339, strings.TrimSpace(meeting.StartsAt))
	if err != nil {
		log.Printf("discord meeting notify skipped: bad start time for meeting %d: %v", meetingID, err)
		return false
	}
	endAt, err := time.Parse(time.RFC3339, strings.TrimSpace(meeting.EndsAt))
	if err != nil {
		log.Printf("discord meeting notify skipped: bad end time for meeting %d: %v", meetingID, err)
		return false
	}
	location := meetingLocation()

	message := fmt.Sprintf(
		"%s booked a new meeting for **%s** in **%s**.\nLocation: **%s**\nTime: `%s - %s`",
		actorMention,
		meeting.Title,
		meeting.BoardName,
		meeting.Location,
		startAt.In(location).Format("02 Jan 2006 03:04 PM"),
		endAt.In(location).Format("03:04 PM"),
	)
	if strings.TrimSpace(meeting.Notes) != "" {
		message += "\nNotes: " + strings.TrimSpace(meeting.Notes)
	}

	ctx, cancel := context.WithTimeout(context.Background(), discordSyncTimeout)
	defer cancel()

	if err := a.discord.SendChannelMessagePinned(ctx, channelID, message); err != nil {
		log.Printf("discord meeting notify failed for meeting %d: %v", meetingID, err)
		return false
	}

	return true
}

func (a *API) notifyMeetingChanged(meeting models.Meeting, verb string) bool {
	if a.discord == nil || !a.discord.Enabled() {
		return false
	}

	channelID, err := db.GetBoardDiscordChannelID(a.conn, meeting.BoardID)
	if err != nil || strings.TrimSpace(channelID) == "" {
		return false
	}

	startAt, err := time.Parse(time.RFC3339, strings.TrimSpace(meeting.StartsAt))
	if err != nil {
		return false
	}
	endAt, err := time.Parse(time.RFC3339, strings.TrimSpace(meeting.EndsAt))
	if err != nil {
		return false
	}
	location := meetingLocation()

	message := fmt.Sprintf(
		"Meeting update: **%s** was %s in **%s**.\nLocation: **%s**\nTime: `%s - %s`",
		meeting.Title,
		verb,
		meeting.BoardName,
		meeting.Location,
		startAt.In(location).Format("02 Jan 2006 03:04 PM"),
		endAt.In(location).Format("03:04 PM"),
	)

	ctx, cancel := context.WithTimeout(context.Background(), discordSyncTimeout)
	defer cancel()
	return a.discord.SendChannelMessage(ctx, channelID, message) == nil
}

func formatRoomTime(t time.Time) string {
	return strings.ToLower(t.Format("3:04 pm"))
}

func (a *API) sendMeetingRoomBookingNotice(meeting models.Meeting, location *time.Location) bool {
	if a.discord == nil || !a.discord.Enabled() {
		return false
	}
	locationConfig, ok := meetingLocationConfig(meeting.Location)
	if !ok || !locationConfig.SendRoomNotice {
		return false
	}
	channelID, roleID := a.roomBookingConfig()
	mention := ""
	if roleID != "" {
		mention = "<@&" + roleID + ">"
	}
	if strings.TrimSpace(channelID) == "" || strings.TrimSpace(mention) == "" {
		return false
	}

	startAt, err := time.Parse(time.RFC3339, strings.TrimSpace(meeting.StartsAt))
	if err != nil {
		log.Printf("meeting room notify skipped: bad start time for meeting %d: %v", meeting.ID, err)
		return false
	}
	endAt, err := time.Parse(time.RFC3339, strings.TrimSpace(meeting.EndsAt))
	if err != nil {
		log.Printf("meeting room notify skipped: bad end time for meeting %d: %v", meeting.ID, err)
		return false
	}

	startLocal := startAt.In(location)
	endLocal := endAt.In(location)
	now := time.Now().In(location)
	meetingDay := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(), 0, 0, 0, 0, location)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	daysBefore := int(meetingDay.Sub(today).Hours() / 24)
	if daysBefore != 1 && daysBefore != 0 {
		return false
	}

	meetingDate := meetingDay.Format("2006-01-02")
	sent, err := db.HasMeetingRoomNotificationSent(a.conn, meeting.ID, daysBefore, meetingDate)
	if err != nil {
		log.Printf("meeting room notify lookup failed for meeting %d: %v", meeting.ID, err)
		return false
	}
	if sent {
		return false
	}

	dayWord := "today"
	if daysBefore == 1 {
		dayWord = "tomorrow"
	}

	message := fmt.Sprintf(
		"%s Please note that %s will be occupied from %s to %s %s.",
		mention,
		strings.TrimSpace(meeting.Location),
		formatRoomTime(startLocal),
		formatRoomTime(endLocal),
		dayWord,
	)

	ctx, cancel := context.WithTimeout(context.Background(), discordSyncTimeout)
	err = a.discord.SendChannelMessage(ctx, channelID, message)
	cancel()
	if err != nil {
		log.Printf("meeting room notify send failed for meeting %d: %v", meeting.ID, err)
		return false
	}

	if err := db.MarkMeetingRoomNotificationSent(a.conn, meeting.ID, daysBefore, meetingDate); err != nil {
		log.Printf("meeting room notify mark failed for meeting %d: %v", meeting.ID, err)
	}

	title := "Room booking notice sent"
	detail := fmt.Sprintf("A room booking notice was sent for %s.", strings.TrimSpace(meeting.Location))
	if daysBefore == 1 {
		detail = fmt.Sprintf("A tomorrow room booking notice was sent for %s.", strings.TrimSpace(meeting.Location))
	}
	a.notifyAdmins("meeting_room_notice", title, meetingAdminBody(meeting, "", detail))

	return true
}

func (a *API) notifyMeetingRoomBookingIfDue(meetingID int64) bool {
	meeting, err := db.GetMeetingByID(a.conn, meetingID)
	if err != nil || meeting.ID == 0 || strings.TrimSpace(meeting.Location) == "" {
		return false
	}
	if config, ok := meetingLocationConfig(meeting.Location); !ok || !config.SendRoomNotice {
		return false
	}

	location, err := time.LoadLocation(appMeetingTimezone)
	if err != nil {
		log.Printf("meeting room notify skipped: failed to load Bahrain timezone: %v", err)
		return false
	}

	return a.sendMeetingRoomBookingNotice(meeting, location)
}

func (a *API) runMeetingRoomBookingSweep(location *time.Location) {
	if a.discord == nil || !a.discord.Enabled() {
		return
	}

	items, err := db.ListMeetingsForRoomNotifications(a.conn)
	if err != nil {
		log.Printf("meeting room sweep failed: %v", err)
		return
	}

	for _, item := range items {
		meeting := models.Meeting{
			ID:       item.MeetingID,
			Location: item.Location,
			StartsAt: item.StartsAt,
			EndsAt:   item.EndsAt,
		}
		_ = a.sendMeetingRoomBookingNotice(meeting, location)
	}
}

func (a *API) runMeetingReminderSweep(location *time.Location) {
	items, err := db.ListMeetings(a.conn, "admin", 0)
	if err != nil {
		log.Printf("meeting reminder sweep failed: %v", err)
		return
	}

	now := time.Now().In(location)
	for _, meeting := range items {
		if meeting.Status != "scheduled" {
			continue
		}

		startAt, err := time.Parse(time.RFC3339, strings.TrimSpace(meeting.StartsAt))
		if err != nil {
			continue
		}
		startLocal := startAt.In(location)
		diff := startLocal.Sub(now)

		reminderType := ""
		title := ""
		body := ""
		switch {
		case diff >= 0 && diff < 5*time.Minute:
			reminderType = "start"
			title = "Meeting starting now"
			body = fmt.Sprintf("%s starts now in %s.", meeting.Title, meeting.Location)
		case diff > 0 && diff <= time.Hour:
			reminderType = "hour_before"
			title = "Meeting in about 1 hour"
			body = fmt.Sprintf("%s starts at %s in %s.", meeting.Title, startLocal.Format("3:04 PM"), meeting.Location)
		default:
			today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
			meetingDay := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(), 0, 0, 0, 0, location)
			if meetingDay.Sub(today) == 24*time.Hour {
				reminderType = "day_before"
				title = "Meeting tomorrow"
				body = fmt.Sprintf("%s is tomorrow at %s in %s.", meeting.Title, startLocal.Format("3:04 PM"), meeting.Location)
			}
		}

		if reminderType == "" {
			continue
		}

		adminDetail := body
		admins, err := db.SearchUsersByRole(a.conn, "admin", "")
		if err == nil {
			for _, admin := range admins {
				sent, err := db.HasMeetingReminderEvent(a.conn, meeting.ID, admin.ID, "admin_"+reminderType, meeting.StartsAt)
				if err != nil || sent {
					continue
				}
				if err := db.CreateNotification(a.conn, admin.ID, "meeting_reminder", title, meetingAdminBody(meeting, "", adminDetail), "/notifications"); err != nil {
					continue
				}
				if err := db.MarkMeetingReminderEvent(a.conn, meeting.ID, admin.ID, "admin_"+reminderType, meeting.StartsAt); err != nil {
					log.Printf("admin reminder mark failed for meeting %d user %d: %v", meeting.ID, admin.ID, err)
				}
			}
		}

		participants, err := db.ListMeetingParticipants(a.conn, meeting.ID)
		if err != nil {
			continue
		}
		for _, participant := range participants {
			sent, err := db.HasMeetingReminderEvent(a.conn, meeting.ID, participant.UserID, reminderType, meeting.StartsAt)
			if err != nil || sent {
				continue
			}

			if err := db.CreateNotification(a.conn, participant.UserID, "meeting_reminder", title, body, "/calendar"); err != nil {
				continue
			}
			if err := db.MarkMeetingReminderEvent(a.conn, meeting.ID, participant.UserID, reminderType, meeting.StartsAt); err != nil {
				log.Printf("meeting reminder mark failed for meeting %d user %d: %v", meeting.ID, participant.UserID, err)
			}
		}
	}
}

func (a *API) runDiscordDueReminderSweep() {
	if a.discord == nil || !a.discord.Enabled() {
		return
	}

	now := time.Now()
	today := now.Format("2006-01-02")

	items, err := db.ListPendingDiscordDueNotifications(a.conn, today)
	if err != nil {
		log.Printf("discord due reminder sweep failed: %v", err)
		return
	}

	for _, item := range items {
		dueDate, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(item.DueDate), now.Location())
		if err != nil {
			log.Printf("discord due reminder skipped: bad due date for card %d: %v", item.CardID, err)
			continue
		}

		todayDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		daysBefore := int(dueDate.Sub(todayDate).Hours() / 24)
		if daysBefore < 0 || daysBefore > 2 {
			continue
		}

		sent, err := db.HasDiscordDueNotificationSent(a.conn, item.CardID, item.UserID, daysBefore, item.DueDate)
		if err != nil {
			log.Printf("discord due reminder lookup failed for card %d user %d: %v", item.CardID, item.UserID, err)
			continue
		}
		if sent {
			continue
		}

		mention := item.UserFullName
		if strings.TrimSpace(item.DiscordUserID) != "" {
			mention = "<@" + strings.TrimSpace(item.DiscordUserID) + ">"
		}

		var message string
		switch daysBefore {
		case 2:
			message = fmt.Sprintf("%s reminder: **%s** in **%s** is due in 2 days. Deadline: `%s`.", mention, item.CardTitle, item.BoardName, item.DueDate)
		case 1:
			message = fmt.Sprintf("%s reminder: **%s** in **%s** is due tomorrow. Deadline: `%s`.", mention, item.CardTitle, item.BoardName, item.DueDate)
		case 0:
			message = fmt.Sprintf("%s last-day reminder: **%s** in **%s** is due today. Deadline: `%s`.", mention, item.CardTitle, item.BoardName, item.DueDate)
		default:
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), discordSyncTimeout)
		err = a.discord.SendChannelMessage(ctx, item.ChannelID, message)
		cancel()
		if err != nil {
			log.Printf("discord due reminder send failed for card %d user %d: %v", item.CardID, item.UserID, err)
			continue
		}

		if err := db.MarkDiscordDueNotificationSent(a.conn, item.CardID, item.UserID, daysBefore, item.DueDate); err != nil {
			log.Printf("discord due reminder mark failed for card %d user %d: %v", item.CardID, item.UserID, err)
		}
	}
}

func (a *API) StartDiscordReminderWorker() {
	if a.discord == nil || !a.discord.Enabled() {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	a.stop = cancel

	go func() {
		location, err := time.LoadLocation(appMeetingTimezone)
		if err != nil {
			log.Printf("discord due reminder worker disabled: failed to load Bahrain timezone: %v", err)
			return
		}

		for {
			now := time.Now().In(location)
			nextRun := time.Date(now.Year(), now.Month(), now.Day(), 9, 0, 0, 0, location)
			if !now.Before(nextRun) {
				nextRun = nextRun.Add(24 * time.Hour)
			}

			timer := time.NewTimer(time.Until(nextRun))
			select {
			case <-ctx.Done():
				timer.Stop()
				log.Println("discord reminder worker stopped")
				return
			case <-timer.C:
				a.runDiscordDueReminderSweep()
				a.runMeetingRoomBookingSweep(location)
			}
		}
	}()

	go func() {
		location, err := time.LoadLocation(appMeetingTimezone)
		if err != nil {
			log.Printf("meeting reminder worker disabled: failed to load Bahrain timezone: %v", err)
			return
		}

		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		for {
			a.runMeetingReminderSweep(location)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
