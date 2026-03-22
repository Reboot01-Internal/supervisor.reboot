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
	"strings"
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
	token         string
	applicationID string
	guildID       string
	categoryID    string
	httpClient    *http.Client
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
	ParentID             string                `json:"parent_id"`
	PermissionOverwrites []permissionOverwrite `json:"permission_overwrites"`
}

type updateChannelRequest struct {
	Name                 string                `json:"name"`
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

	if token == "" || appID == "" || guildID == "" || categoryID == "" {
		return nil
	}

	return &Service{
		token:         token,
		applicationID: appID,
		guildID:       guildID,
		categoryID:    categoryID,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *Service) Enabled() bool {
	return s != nil
}

func (s *Service) CreateBoardChannel(ctx context.Context, boardName string, members []MemberAccess) (string, error) {
	body := createChannelRequest{
		Name:                 sanitizeChannelName(boardName),
		Type:                 0,
		ParentID:             s.categoryID,
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

func (s *Service) UpdateBoardChannel(ctx context.Context, channelID, boardName string, members []MemberAccess, previouslyManagedUserIDs []string) error {
	existingOverwrites, err := s.GetChannelPermissionOverwrites(ctx, channelID)
	if err != nil {
		return err
	}

	body := updateChannelRequest{
		Name:                 sanitizeChannelName(boardName),
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
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
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
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
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
