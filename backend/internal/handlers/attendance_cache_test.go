package handlers

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestBioCacheReuseExpiryAndFailure(t *testing.T) {
	var c bioCache[int]
	calls := 0
	load := func() (int, error) { calls++; return calls, nil }
	value, at, err := c.get(context.Background(), "member", load)
	if err != nil || value != 1 || at.IsZero() {
		t.Fatal(value, at, err)
	}
	value, again, _ := c.get(context.Background(), "member", load)
	if value != 1 || calls != 1 || again != at {
		t.Fatal("cache not reused")
	}
	c.entries["member"].fetched = time.Now().Add(-bioCacheTTL - time.Second)
	value, _, _ = c.get(context.Background(), "member", load)
	if value != 2 {
		t.Fatal("expired value reused")
	}
	_, _, _ = c.get(context.Background(), "failure", func() (int, error) { return 0, errors.New("provider unavailable") })
	value, _, err = c.get(context.Background(), "failure", load)
	if err != nil || value != 3 {
		t.Fatal("failure was cached")
	}
}
func TestBioCacheConcurrentRequests(t *testing.T) {
	var c bioCache[int]
	var calls atomic.Int32
	var wg sync.WaitGroup
	release := make(chan struct{})
	started := make(chan struct{})
	load := func() (int, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		return 42, nil
	}
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			value, _, err := c.get(context.Background(), "same", load)
			if err != nil || value != 42 {
				t.Error(value, err)
			}
		}()
	}
	<-started
	close(release)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("duplicate upstream loads", calls.Load())
	}
}
