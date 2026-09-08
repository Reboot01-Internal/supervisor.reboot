package handlers

import (
	"github.com/joho/godotenv"
	"os"
	"testing"
)

func TestDirectoryLive(t *testing.T) {
	if os.Getenv("TASKFLOW_TEST_LIVE_DIRECTORY") != "1" {
		t.Skip("opt-in live Reboot test")
	}
	if err := godotenv.Load("../../.env"); err != nil {
		t.Fatal(err)
	}
	token, err := getRebootAdminToken()
	if err != nil {
		t.Fatal("admin authentication failed")
	}
	for _, op := range []string{"search", "phones", "user"} {
		vars := map[string]any{}
		if op == "search" {
			vars["like"] = "%ak1%"
		} else if op == "phones" {
			vars["logins"] = []string{"ak1"}
		} else {
			vars["login"] = "ak1"
		}
		_, err = directoryQuery(token, directoryQueries[op], vars)
		if err != nil {
			t.Errorf("%s: %v", op, err)
		}
	}
}
