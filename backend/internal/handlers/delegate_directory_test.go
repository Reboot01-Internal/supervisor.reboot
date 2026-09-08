package handlers

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVerifiedDirectoryDelegate(t *testing.T) {
	for _, tc := range []struct {
		name, login string
		status      int
		want        bool
	}{
		{"delegate", "falmoath", 200, true},
		{"other user", "ak1", 200, false},
		{"rejected signature", "falmoath", 401, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(`{"data":{"user":[{"login":"` + tc.login + `"}]}}`))
			}))
			defer server.Close()
			t.Setenv("SCHOOL_URL", server.URL)
			token := "header." + base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"falmoath"}`)) + ".signature"
			if got := verifiedDirectoryDelegate(token); got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
	if verifiedDirectoryDelegate("invalid") {
		t.Fatal("accepted malformed token")
	}
}
