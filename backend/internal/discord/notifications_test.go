package discord

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image/gif"
	"io"
	"net/http"
	"strings"
	"testing"
	"unicode/utf16"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestNotificationAttachmentRetryAndPin(t *testing.T) {
	posts, pins := 0, 0
	var firstBody []byte
	s := &Service{token: "test", httpClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		status, response := 200, `{"id":"message-1"}`
		if r.Method == http.MethodPut {
			pins++
			if !strings.HasSuffix(r.URL.Path, "/messages/pins/message-1") {
				t.Fatalf("unexpected pin path: %s", r.URL.Path)
			}
		} else {
			posts++
			raw, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatal(err)
			}
			if posts == 1 {
				firstBody = raw
			} else if !bytes.Equal(raw, firstBody) {
				t.Fatal("retry did not preserve upload body")
			}
			r.Body = io.NopCloser(bytes.NewReader(raw))
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				t.Fatal(err)
			}
			defer r.MultipartForm.RemoveAll()
			var payload messageRequest
			if err := json.Unmarshal([]byte(r.FormValue("payload_json")), &payload); err != nil {
				t.Fatal(err)
			}
			if payload.AllowedMentions == nil || len(payload.AllowedMentions.Parse) != 0 || len(payload.AllowedMentions.Users) != 1 || payload.AllowedMentions.Users[0] != "123" {
				t.Fatalf("unsafe mentions: %+v", payload.AllowedMentions)
			}
			if payload.Embeds[0].Image.URL != "attachment://celebration.gif" || payload.Attachments[0].Filename != "celebration.gif" {
				t.Fatal("missing image attachment reference")
			}
			f, _, err := r.FormFile("files[0]")
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			animation, err := gif.DecodeAll(f)
			if err != nil {
				t.Fatal(err)
			}
			if len(animation.Image) < 2 || animation.LoopCount != 0 {
				t.Fatal("image is not an animated looping GIF")
			}
			if posts == 1 {
				status = 429
				response = `{"retry_after":0.001}`
			}
		}
		return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(response))}, nil
	})}}
	err := s.SendNotification(context.Background(), "channel", "<@123> nice work! @everyone", NewEmbed("Done", "Nice work", "Board", ColorSuccess), true, true)
	if err != nil {
		t.Fatal(err)
	}
	if posts != 2 || pins != 1 {
		t.Fatalf("posts=%d pins=%d", posts, pins)
	}
}

func TestNotificationJSONAndLimits(t *testing.T) {
	s := &Service{httpClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatal("expected JSON")
		}
		var body messageRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Embeds[0].Image != nil || len(body.Attachments) != 0 {
			t.Fatal("reminder should not attach celebration")
		}
		if len(utf16.Encode([]rune(body.Embeds[0].Title))) > 256 {
			t.Fatal("title exceeds Discord limit")
		}
		if len(body.Embeds[0].Fields) != 5 {
			t.Fatal("field limit failed")
		}
		if body.Embeds[0].Fields[0].Value != "11 October 2026" {
			t.Fatal("unreadable deadline")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"1"}`))}, nil
	})}}
	fields := []EmbedField{DeadlineField("2026-10-11")}
	for i := 0; i < 8; i++ {
		fields = append(fields, EmbedField{Name: "Notes", Value: strings.Repeat("😀", 1000)})
	}
	if err := s.SendNotification(context.Background(), "channel", "", NewEmbed(strings.Repeat("😀", 300), "Reminder", "Board", ColorReminder, fields...), false, false); err != nil {
		t.Fatal(err)
	}
}

func TestBotCanEmbedAndAttach(t *testing.T) {
	s := &Service{guildID: "guild", applicationID: "bot"}
	for _, overwrite := range s.permissionOverwrites(nil) {
		if overwrite.ID == "bot" {
			var allow int64
			if _, err := fmt.Sscan(overwrite.Allow, &allow); err != nil {
				t.Fatal(err)
			}
			if allow&permissionEmbedLinks == 0 || allow&permissionAttachFiles == 0 {
				t.Fatal("bot lacks rich message permissions")
			}
		}
	}
}
