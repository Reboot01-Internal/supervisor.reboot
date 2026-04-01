package handlers

import "strings"

type meetingLocationOption struct {
	Label          string
	SendRoomNotice bool
	BlocksRoomSlot bool
}

var meetingLocationCatalog = []meetingLocationOption{
	{Label: "Sandbox", SendRoomNotice: true, BlocksRoomSlot: true},
	{Label: "Quest", SendRoomNotice: true, BlocksRoomSlot: true},
	{Label: "Pixel", SendRoomNotice: true, BlocksRoomSlot: true},
	{Label: "Online", SendRoomNotice: false, BlocksRoomSlot: false},
}

func normalizeMeetingRoomLabel(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	for _, option := range meetingLocationCatalog {
		if strings.EqualFold(option.Label, raw) {
			return option.Label
		}
	}
	return ""
}

func meetingLocationConfig(raw string) (meetingLocationOption, bool) {
	label := normalizeMeetingRoomLabel(raw)
	if label == "" {
		return meetingLocationOption{}, false
	}
	for _, option := range meetingLocationCatalog {
		if option.Label == label {
			return option, true
		}
	}
	return meetingLocationOption{}, false
}
