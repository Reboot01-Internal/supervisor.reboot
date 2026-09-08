package handlers

import "strings"

// temporaryAdminUsernames is the ONLY list to edit for temporary admin access.
// Add or remove Reboot usernames here (not names or emails), then restart the API.
// These accounts receive TaskFlow admin access and verified server-side Reboot
// directory lookups. Accounts must still exist and be active in TaskFlow.
var temporaryAdminUsernames = []string{
	"falmoath",
}

func isTemporaryAdmin(username string) bool {
	username = strings.ToLower(strings.TrimSpace(username))
	for _, allowed := range temporaryAdminUsernames {
		if username != "" && username == strings.ToLower(strings.TrimSpace(allowed)) {
			return true
		}
	}
	return false
}
