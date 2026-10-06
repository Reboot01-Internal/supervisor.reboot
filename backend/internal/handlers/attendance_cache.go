package handlers

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

const bioCacheTTL = 2 * time.Hour

type bioCacheEntry[T any] struct {
	value   T
	fetched time.Time
	err     error
	done    chan struct{}
}
type bioCache[T any] struct {
	mu      sync.Mutex
	entries map[string]*bioCacheEntry[T]
}

func (c *bioCache[T]) get(ctx context.Context, key string, load func() (T, error)) (T, time.Time, error) {
	c.mu.Lock()
	if c.entries == nil {
		c.entries = map[string]*bioCacheEntry[T]{}
	}
	now := time.Now()
	for k, e := range c.entries {
		if e.done == nil && now.Sub(e.fetched) >= bioCacheTTL {
			delete(c.entries, k)
		}
	}
	if e, ok := c.entries[key]; ok {
		done := e.done
		c.mu.Unlock()
		if done != nil {
			select {
			case <-done:
			case <-ctx.Done():
				var zero T
				return zero, time.Time{}, ctx.Err()
			}
		}
		return e.value, e.fetched, e.err
	}
	// Bound resident completed entries. Never evict a request still loading.
	if len(c.entries) >= 512 {
		var oldest string
		var at time.Time
		for k, e := range c.entries {
			if e.done == nil && (at.IsZero() || e.fetched.Before(at)) {
				oldest = k
				at = e.fetched
			}
		}
		if oldest != "" {
			delete(c.entries, oldest)
		}
	}
	e := &bioCacheEntry[T]{done: make(chan struct{})}
	c.entries[key] = e
	c.mu.Unlock()
	value, err := load()
	c.mu.Lock()
	e.value = value
	e.err = err
	e.fetched = time.Now()
	done := e.done
	e.done = nil
	if err != nil {
		delete(c.entries, key)
	}
	close(done)
	c.mu.Unlock()
	return value, e.fetched, err
}

var attendanceMonthCache bioCache[[]attendanceDay]
var attendanceEmployeeCache bioCache[[]bioEmployee]

func bioConfigurationKey() string {
	values := []string{}
	for _, key := range []string{"BIO_TIME_TOKEN", "BIO_TIME_EMPLOYEES", "BIO_TIME_RECORDS", "BIO_TIME_TRANSACTIONS", "BIO_TIME_API_URL"} {
		values = append(values, os.Getenv(key))
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join(values, "\x00"))))
}
func fetchBioAttendance(ctx context.Context, login, start, end string) ([]attendanceDay, error) {
	days, _, err := fetchBioAttendanceSnapshot(ctx, login, start, end)
	return days, err
}

// Cache whole months so a weekly card and monthly calendar share provider requests.
func fetchBioAttendanceSnapshot(ctx context.Context, login, start, end string) ([]attendanceDay, time.Time, error) {
	first, err := time.Parse("2006-01-02", start)
	if err != nil {
		return nil, time.Time{}, err
	}
	last, err := time.Parse("2006-01-02", end)
	if err != nil {
		return nil, time.Time{}, err
	}
	result := []attendanceDay{}
	var fetched time.Time
	for month := time.Date(first.Year(), first.Month(), 1, 0, 0, 0, 0, time.UTC); !month.After(last); month = month.AddDate(0, 1, 0) {
		lower := month.Format("2006-01-02")
		upper := month.AddDate(0, 1, -1).Format("2006-01-02")
		key := bioConfigurationKey() + ":" + strings.ToLower(strings.TrimSpace(login)) + ":" + lower
		days, at, e := attendanceMonthCache.get(ctx, key, func() ([]attendanceDay, error) { return fetchBioAttendanceUncached(ctx, login, lower, upper) })
		if e != nil {
			return nil, time.Time{}, e
		}
		if fetched.IsZero() || at.Before(fetched) {
			fetched = at
		}
		for _, day := range days {
			if day.Date >= start && day.Date <= end {
				result = append(result, day)
			}
		}
	}
	return result, fetched, nil
}
