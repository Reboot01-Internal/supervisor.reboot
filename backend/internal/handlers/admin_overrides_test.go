package handlers

import "testing"

func TestTemporaryAdminList(t *testing.T) {
	original := temporaryAdminUsernames
	t.Cleanup(func() { temporaryAdminUsernames = original })
	temporaryAdminUsernames = []string{"temporary-test-user"}
	if resolvedRole(" TEMPORARY-TEST-USER ", "supervisor") != "admin" {
		t.Fatal("listed username did not receive admin role")
	}
	if !isTemporaryAdmin("temporary-test-user") {
		t.Fatal("listed username did not receive directory delegation")
	}
	if resolvedRole("unlisted", "supervisor") != "supervisor" {
		t.Fatal("unlisted role changed")
	}
	temporaryAdminUsernames = nil
	if isTemporaryAdmin("temporary-test-user") || resolvedRole("temporary-test-user", "supervisor") != "supervisor" {
		t.Fatal("removed username retained override")
	}
	if resolvedRole("existing-admin", "admin") != "admin" {
		t.Fatal("normal admin role changed")
	}
}
