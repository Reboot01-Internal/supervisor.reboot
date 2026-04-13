package discord

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	permissionManageChannels     int64 = 16
	permissionViewChannel        int64 = 1024
	permissionSendMessages       int64 = 2048
	permissionManageMessages     int64 = 8192
	permissionReadMessageHistory int64 = 65536
	permissionPinMessages        int64 = 1 << 51
)

var channelSanitizer = regexp.MustCompile(`[^a-z0-9-]+`)
var discordNameTokenPattern = regexp.MustCompile(`[a-z0-9_-]+`)

type Service struct {
	token          string
	applicationID  string
	guildID        string
	categoryID     string
	techTeamRoleID string
	httpClient     *http.Client
	categoryMu     sync.Mutex
	categoryIDs    map[string]string
}

type MemberAccess struct {
	DiscordUserID string
}

type guildMemberSearchResult struct {
	User struct {
		ID         string `json:"id"`
		Username   string `json:"username"`
		GlobalName string `json:"global_name"`
	} `json:"user"`
	Nick string `json:"nick"`
}

type guildMemberResult struct {
	User struct {
		ID         string `json:"id"`
		Username   string `json:"username"`
		GlobalName string `json:"global_name"`
	} `json:"user"`
	Nick string `json:"nick"`
}

type channelResponse struct {
	ID string `json:"id"`
}

type guildChannel struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     int    `json:"type"`
	ParentID string `json:"parent_id"`
}

type channelDetails struct {
	PermissionOverwrites []permissionOverwrite `json:"permission_overwrites"`
}

type permissionOverwrite struct {
	ID    string `json:"id"`
	Type  int    `json:"type"`
	Allow string `json:"allow,omitempty"`
	Deny  string `json:"deny,omitempty"`
}

type createChannelRequest struct {
	Name                 string                `json:"name"`
	Type                 int                   `json:"type"`
	ParentID             string                `json:"parent_id,omitempty"`
	PermissionOverwrites []permissionOverwrite `json:"permission_overwrites,omitempty"`
}

type updateChannelRequest struct {
	Name                 string                `json:"name"`
	ParentID             string                `json:"parent_id,omitempty"`
	PermissionOverwrites []permissionOverwrite `json:"permission_overwrites"`
}

type messageRequest struct {
	Content string `json:"content"`
}

type messageResponse struct {
	ID string `json:"id"`
}

func NewFromEnv() *Service {
	token := strings.TrimSpace(os.Getenv("DISCORD_BOT_TOKEN"))
	appID := strings.TrimSpace(os.Getenv("DISCORD_APPLICATION_ID"))
	guildID := strings.TrimSpace(os.Getenv("DISCORD_GUILD_ID"))
	categoryID := strings.TrimSpace(os.Getenv("DISCORD_CATEGORY_ID"))
	techTeamRoleID := strings.TrimSpace(os.Getenv("DISCORD_TECH_TEAM_ROLE_ID"))

	if token == "" || appID == "" || guildID == "" {
		return nil
	}

	return &Service{
		token:          token,
		applicationID:  appID,
		guildID:        guildID,
		categoryID:     categoryID,
		techTeamRoleID: techTeamRoleID,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		categoryIDs: map[string]string{},
	}
}

func (s *Service) Enabled() bool {
	return s != nil
}

func (s *Service) EnsureSupervisorCategory(ctx context.Context, supervisorName string) (string, error) {
	categoryName := supervisorCategoryName(supervisorName)
	if categoryName == "" {
		return s.categoryID, nil
	}

	s.categoryMu.Lock()
	if categoryID := strings.TrimSpace(s.categoryIDs[categoryName]); categoryID != "" {
		s.categoryMu.Unlock()
		return categoryID, nil
	}
	s.categoryMu.Unlock()

	var channels []guildChannel
	if err := s.doJSON(ctx, http.MethodGet, fmt.Sprintf("https://discord.com/api/v10/guilds/%s/channels", s.guildID), nil, &channels); err != nil {
		return "", err
	}
	s.categoryMu.Lock()
	for _, channel := range channels {
		if channel.Type != 4 {
			continue
		}
		name := sanitizeChannelName(channel.Name)
		if name == "" {
			continue
		}
		s.categoryIDs[name] = strings.TrimSpace(channel.ID)
	}
	if categoryID := strings.TrimSpace(s.categoryIDs[categoryName]); categoryID != "" {
		s.categoryMu.Unlock()
		return categoryID, nil
	}
	s.categoryMu.Unlock()

	body := createChannelRequest{
		Name:                 categoryName,
		Type:                 4,
		PermissionOverwrites: s.categoryPermissionOverwrites(),
	}

	var out channelResponse
	if err := s.doJSON(ctx, http.MethodPost, fmt.Sprintf("https://discord.com/api/v10/guilds/%s/channels", s.guildID), body, &out); err != nil {
		return "", err
	}
	if strings.TrimSpace(out.ID) == "" {
		return "", fmt.Errorf("discord returned empty category id")
	}
	categoryID := strings.TrimSpace(out.ID)
	s.categoryMu.Lock()
	s.categoryIDs[categoryName] = categoryID
	s.categoryMu.Unlock()
	return categoryID, nil
}

func (s *Service) CreateBoardChannel(ctx context.Context, boardName, categoryID string, members []MemberAccess) (string, error) {
	categoryID = strings.TrimSpace(categoryID)
	if categoryID == "" {
		categoryID = s.categoryID
	}

	body := createChannelRequest{
		Name:                 sanitizeChannelName(boardName),
		Type:                 0,
		ParentID:             categoryID,
		PermissionOverwrites: s.permissionOverwrites(members),
	}

	var out channelResponse
	if err := s.doJSON(ctx, http.MethodPost, fmt.Sprintf("https://discord.com/api/v10/guilds/%s/channels", s.guildID), body, &out); err != nil {
		return "", err
	}
	if strings.TrimSpace(out.ID) == "" {
		return "", fmt.Errorf("discord returned empty channel id")
	}
	return out.ID, nil
}

func (s *Service) UpdateBoardChannel(ctx context.Context, channelID, boardName, categoryID string, members []MemberAccess, previouslyManagedUserIDs []string) error {
	existingOverwrites, err := s.GetChannelPermissionOverwrites(ctx, channelID)
	if err != nil {
		return err
	}

	body := updateChannelRequest{
		Name:                 sanitizeChannelName(boardName),
		ParentID:             strings.TrimSpace(categoryID),
		PermissionOverwrites: s.mergePermissionOverwrites(existingOverwrites, members, previouslyManagedUserIDs),
	}

	return s.doJSON(ctx, http.MethodPatch, fmt.Sprintf("https://discord.com/api/v10/channels/%s", channelID), body, nil)
}

func (s *Service) ResolveMemberByNickname(ctx context.Context, nickname string) (string, error) {
	query := strings.TrimSpace(nickname)
	if query == "" {
		return "", nil
	}

	normalizedQuery := normalizeDiscordName(query)

	members, err := s.ListGuildMembers(ctx)
	if err == nil {
		var exactMatches []guildMemberResult
		for _, member := range members {
			if matchesDiscordNameQuery(normalizedQuery, member.Nick) ||
				matchesDiscordNameQuery(normalizedQuery, member.User.Username) ||
				matchesDiscordNameQuery(normalizedQuery, member.User.GlobalName) {
				exactMatches = append(exactMatches, member)
			}
		}
		if len(exactMatches) == 1 {
			return strings.TrimSpace(exactMatches[0].User.ID), nil
		}
		if len(exactMatches) > 1 {
			return "", fmt.Errorf("multiple discord members matched nickname %q", query)
		}
	}

	var results []guildMemberSearchResult
	searchURL := fmt.Sprintf("https://discord.com/api/v10/guilds/%s/members/search?query=%s&limit=25", s.guildID, url.QueryEscape(query))
	if err := s.doJSON(ctx, http.MethodGet, searchURL, nil, &results); err != nil {
		return "", err
	}

	var exactMatches []guildMemberSearchResult
	for _, result := range results {
		if matchesDiscordNameQuery(normalizedQuery, result.Nick) ||
			matchesDiscordNameQuery(normalizedQuery, result.User.Username) ||
			matchesDiscordNameQuery(normalizedQuery, result.User.GlobalName) {
			exactMatches = append(exactMatches, result)
		}
	}

	if len(exactMatches) == 1 {
		return strings.TrimSpace(exactMatches[0].User.ID), nil
	}
	if len(exactMatches) > 1 {
		return "", fmt.Errorf("multiple discord members matched nickname %q", query)
	}
	if len(results) == 1 {
		return strings.TrimSpace(results[0].User.ID), nil
	}
	return "", nil
}

func (s *Service) ListGuildMembers(ctx context.Context) ([]guildMemberResult, error) {
	allMembers := make([]guildMemberResult, 0, 256)
	after := ""

	for {
		endpoint := fmt.Sprintf("https://discord.com/api/v10/guilds/%s/members?limit=1000", s.guildID)
		if after != "" {
			endpoint += "&after=" + url.QueryEscape(after)
		}

		var batch []guildMemberResult
		if err := s.doJSON(ctx, http.MethodGet, endpoint, nil, &batch); err != nil {
			return nil, err
		}
		if len(batch) == 0 {
			break
		}

		allMembers = append(allMembers, batch...)
		after = strings.TrimSpace(batch[len(batch)-1].User.ID)
		if len(batch) < 1000 || after == "" {
			break
		}
	}

	return allMembers, nil
}

func (s *Service) SendChannelMessage(ctx context.Context, channelID, content string) error {
	_, err := s.sendChannelMessage(ctx, channelID, content)
	return err
}

func (s *Service) SendChannelMessagePinned(ctx context.Context, channelID, content string) error {
	messageID, err := s.sendChannelMessage(ctx, channelID, content)
	if err != nil {
		return err
	}
	if strings.TrimSpace(messageID) == "" {
		return fmt.Errorf("discord returned empty message id")
	}
	return s.doJSON(ctx, http.MethodPut, fmt.Sprintf("https://discord.com/api/v10/channels/%s/messages/pins/%s", channelID, messageID), nil, nil)
}

func (s *Service) sendChannelMessage(ctx context.Context, channelID, content string) (string, error) {
	body := messageRequest{
		Content: strings.TrimSpace(content),
	}
	if body.Content == "" {
		return "", nil
	}

	var out messageResponse
	if err := s.doJSON(ctx, http.MethodPost, fmt.Sprintf("https://discord.com/api/v10/channels/%s/messages", channelID), body, &out); err != nil {
		return "", err
	}
	return strings.TrimSpace(out.ID), nil
}

func (s *Service) DeleteChannel(ctx context.Context, channelID string) error {
	return s.doJSON(ctx, http.MethodDelete, fmt.Sprintf("https://discord.com/api/v10/channels/%s", channelID), nil, nil)
}

func (s *Service) GetChannelPermissionOverwrites(ctx context.Context, channelID string) ([]permissionOverwrite, error) {
	var out channelDetails
	if err := s.doJSON(ctx, http.MethodGet, fmt.Sprintf("https://discord.com/api/v10/channels/%s", channelID), nil, &out); err != nil {
		return nil, err
	}
	return out.PermissionOverwrites, nil
}

func (s *Service) permissionOverwrites(members []MemberAccess) []permissionOverwrite {
	viewAndChat := fmt.Sprintf("%d", permissionViewChannel+permissionSendMessages+permissionReadMessageHistory)
	viewOnly := fmt.Sprintf("%d", permissionViewChannel+permissionReadMessageHistory)
	botAllow := fmt.Sprintf("%d", permissionViewChannel+permissionSendMessages+permissionManageMessages+permissionReadMessageHistory+permissionManageChannels+permissionPinMessages)

	seen := map[string]bool{}
	overwrites := []permissionOverwrite{
		{
			ID:   s.guildID,
			Type: 0,
			Deny: fmt.Sprintf("%d", permissionViewChannel),
		},
		{
			ID:    s.applicationID,
			Type:  1,
			Allow: botAllow,
		},
	}

	if s.techTeamRoleID != "" {
		overwrites = append(overwrites, permissionOverwrite{
			ID:    s.techTeamRoleID,
			Type:  0,
			Allow: viewOnly,
		})
	}

	for _, member := range members {
		discordUserID := strings.TrimSpace(member.DiscordUserID)
		if discordUserID == "" || seen[discordUserID] {
			continue
		}
		seen[discordUserID] = true
		overwrites = append(overwrites, permissionOverwrite{
			ID:    discordUserID,
			Type:  1,
			Allow: viewAndChat,
		})
	}

	return overwrites
}

func (s *Service) categoryPermissionOverwrites() []permissionOverwrite {
	return s.permissionOverwrites(nil)
}

func (s *Service) mergePermissionOverwrites(existing []permissionOverwrite, members []MemberAccess, previouslyManagedUserIDs []string) []permissionOverwrite {
	base := s.permissionOverwrites(members)

	previouslyManaged := map[string]bool{}
	for _, discordUserID := range previouslyManagedUserIDs {
		discordUserID = strings.TrimSpace(discordUserID)
		if discordUserID == "" {
			continue
		}
		previouslyManaged[discordUserID] = true
	}

	var preserved []permissionOverwrite
	for _, overwrite := range existing {
		if overwrite.ID == s.guildID || overwrite.ID == s.applicationID {
			continue
		}
		if overwrite.Type == 1 && previouslyManaged[overwrite.ID] {
			continue
		}
		preserved = append(preserved, overwrite)
	}

	return append(preserved, base...)
}

func (s *Service) doJSON(ctx context.Context, method, url string, payload any, out any) error {
	var raw []byte
	if payload != nil {
		var err error
		raw, err = json.Marshal(payload)
		if err != nil {
			return err
		}
	}

	for attempt := 0; attempt < 2; attempt++ {
		var body io.Reader
		if raw != nil {
			body = bytes.NewReader(raw)
		}

		req, err := http.NewRequestWithContext(ctx, method, url, body)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bot "+s.token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return err
		}

		respBody, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			return readErr
		}

		if resp.StatusCode == http.StatusTooManyRequests && attempt == 0 {
			wait := discordRetryAfter(resp.Header.Get("Retry-After"), respBody)
			timer := time.NewTimer(wait)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
				continue
			}
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return fmt.Errorf("discord api %s %s failed: status=%d body=%s", method, url, resp.StatusCode, strings.TrimSpace(string(respBody)))
		}

		if out != nil && len(respBody) > 0 {
			if err := json.Unmarshal(respBody, out); err != nil {
				return err
			}
		}
		return nil
	}
	return nil
}

func discordRetryAfter(header string, body []byte) time.Duration {
	if seconds, err := strconv.ParseFloat(strings.TrimSpace(header), 64); err == nil && seconds > 0 {
		return time.Duration(seconds*1000) * time.Millisecond
	}

	var payload struct {
		RetryAfter float64 `json:"retry_after"`
	}
	if err := json.Unmarshal(body, &payload); err == nil && payload.RetryAfter > 0 {
		return time.Duration(payload.RetryAfter*1000) * time.Millisecond
	}

	return 2 * time.Second
}

func normalizeDiscordName(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func matchesDiscordNameQuery(normalizedQuery, candidate string) bool {
	candidate = normalizeDiscordName(candidate)
	if candidate == "" || normalizedQuery == "" {
		return false
	}
	if candidate == normalizedQuery {
		return true
	}

	for _, token := range discordNameTokenPattern.FindAllString(candidate, -1) {
		if token == normalizedQuery {
			return true
		}
	}

	return false
}

func sanitizeChannelName(boardName string) string {
	name := strings.ToLower(strings.TrimSpace(boardName))
	name = strings.ReplaceAll(name, "_", "-")
	name = strings.ReplaceAll(name, " ", "-")
	name = channelSanitizer.ReplaceAllString(name, "-")
	name = strings.Trim(name, "-")
	for strings.Contains(name, "--") {
		name = strings.ReplaceAll(name, "--", "-")
	}
	if name == "" {
		name = "board"
	}
	if len(name) > 100 {
		name = strings.Trim(name[:100], "-")
		if name == "" {
			name = "board"
		}
	}
	return name
}

func supervisorCategoryName(supervisorName string) string {
	name := strings.TrimSpace(strings.TrimPrefix(supervisorName, "@"))
	if name == "" {
		return ""
	}
	return sanitizeChannelName(name + "-boards")
}
