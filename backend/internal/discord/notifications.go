package discord

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
)

type Embed struct {
	Title       string       `json:"title"`
	Description string       `json:"description,omitempty"`
	Color       int          `json:"color"`
	Fields      []EmbedField `json:"fields,omitempty"`
	Footer      EmbedFooter  `json:"footer"`
	Image       *EmbedImage  `json:"image,omitempty"`
}
type EmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}
type EmbedFooter struct {
	Text string `json:"text"`
}
type EmbedImage struct {
	URL string `json:"url"`
}
type allowedMentions struct {
	Parse []string `json:"parse"`
	Users []string `json:"users,omitempty"`
}
type attachment struct {
	ID          int    `json:"id"`
	Filename    string `json:"filename"`
	Description string `json:"description"`
}

const (
	ColorReminder   = 0xe7a938
	ColorSuccess    = 0x38ad7d
	ColorAssignment = 0x8c73f1
	ColorMeeting    = 0x5865f2
)

// Bound user-provided text to Discord's UTF-16 limits. Leave headroom for
// multiple fields within the aggregate 6,000-character embed limit.
func displayText(s string, limit int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "—"
	}
	units := 0
	for i, r := range s {
		units += utf16.RuneLen(r)
		if units > limit-1 {
			return s[:i] + "…"
		}
	}
	return s
}

func NewEmbed(title, description, board string, color int, fields ...EmbedField) Embed {
	e := Embed{Title: displayText(title, 256), Description: displayText(description, 1400), Color: color,
		Footer: EmbedFooter{Text: displayText("BoardFlow · "+board, 512)}}
	for _, f := range fields {
		if len(e.Fields) == 5 {
			break
		}
		f.Name = displayText(f.Name, 100)
		f.Value = displayText(f.Value, 512)
		e.Fields = append(e.Fields, f)
	}
	return e
}

func DeadlineField(date string) EmbedField {
	if parsed, err := time.Parse("2006-01-02", strings.TrimSpace(date)); err == nil {
		date = parsed.Format("2 January 2006")
	}
	return EmbedField{Name: "Deadline", Value: date, Inline: true}
}

var userMentionPattern = regexp.MustCompile(`<@!?(\d+)>`)

// Keep notification pings in content; embed mentions do not notify users.
// Only explicit user IDs can ping, never roles or @everyone from task text.
func (s *Service) SendNotification(ctx context.Context, channelID, content string, embed Embed, celebrate, pin bool) error {
	users := []string{}
	for _, match := range userMentionPattern.FindAllStringSubmatch(content, -1) {
		users = append(users, match[1])
	}
	body := messageRequest{Content: strings.TrimSpace(content), Embeds: []Embed{embed}, AllowedMentions: &allowedMentions{Parse: []string{}, Users: users}}
	endpoint := fmt.Sprintf("https://discord.com/api/v10/channels/%s/messages", channelID)
	var out messageResponse
	if celebrate {
		gifData, err := celebrationGIF()
		if err != nil {
			return err
		}
		body.Embeds[0].Image = &EmbedImage{URL: "attachment://celebration.gif"}
		body.Attachments = []attachment{{ID: 0, Filename: "celebration.gif", Description: "Animated confetti celebrating a completed task"}}
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		if err := writer.WriteField("payload_json", string(payload)); err != nil {
			return err
		}
		part, err := writer.CreateFormFile("files[0]", "celebration.gif")
		if err != nil {
			return err
		}
		if _, err := part.Write(gifData); err != nil {
			return err
		}
		if err := writer.Close(); err != nil {
			return err
		}
		if err := s.doRequest(ctx, http.MethodPost, endpoint, buf.Bytes(), writer.FormDataContentType(), &out); err != nil {
			return err
		}
	} else if err := s.doJSON(ctx, http.MethodPost, endpoint, body, &out); err != nil {
		return err
	}
	if pin {
		if out.ID == "" {
			return fmt.Errorf("discord returned empty message id")
		}
		return s.doJSON(ctx, http.MethodPut, endpoint+"/pins/"+out.ID, nil, nil)
	}
	return nil
}
