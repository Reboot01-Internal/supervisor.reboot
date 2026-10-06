package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

var bioTimeClient = &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}

type bioEmployee struct {
	ID    int64  `json:"id"`
	Code  string `json:"emp_code"`
	Login string `json:"Platform ID"`
}
type bioReport struct {
	Code     string `json:"emp_code"`
	Date     string `json:"att_date"`
	First    string `json:"first_punch"`
	Last     string `json:"last_punch"`
	Duration string `json:"total_time"`
}
type bioTransaction struct {
	ID    int64  `json:"id"`
	Code  string `json:"emp_code"`
	Login string `json:"user_defined_2"`
	Date  string `json:"att_date"`
	Time  string `json:"punch_time"`
	State string `json:"punch_state"`
}
type attendancePunch struct {
	Time  string `json:"time"`
	State string `json:"state"`
}
type attendanceDay struct {
	Date       string            `json:"date"`
	Weekday    string            `json:"weekday"`
	FirstPunch string            `json:"firstPunch"`
	LastPunch  string            `json:"lastPunch"`
	TotalTime  string            `json:"totalTime"`
	Minutes    *int              `json:"minutes"`
	Status     string            `json:"status"`
	Punches    []attendancePunch `json:"punches"`
	Note       string            `json:"note,omitempty"`
}

// Rebuild page URLs on the configured endpoint, never forward secrets to a provider's next URL.
func bioPages[T any](ctx context.Context, endpoint, token string, filters url.Values) ([]T, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
		return nil, errors.New("BioTime endpoint configuration is invalid")
	}
	all := []T{}
	seen := map[[32]byte]bool{}
	expected := -1
	for page := 1; page <= 500; page++ {
		q := url.Values{}
		for k, v := range filters {
			q[k] = append([]string(nil), v...)
		}
		q.Set("page", strconv.Itoa(page))
		q.Set("page_size", "200")
		u.RawQuery = q.Encode()
		req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
		if err != nil {
			return nil, errors.New("Could not create BioTime request")
		}
		req.Header.Set("Authorization", "Token "+token)
		res, err := bioTimeClient.Do(req)
		if err != nil {
			return nil, errors.New("BioTime is unreachable or timed out. Check the backend network connection and retry")
		}
		var body struct {
			Count *int            `json:"count"`
			Next  *string         `json:"next"`
			Code  *int            `json:"code"`
			Data  json.RawMessage `json:"data"`
		}
		decodeErr := json.NewDecoder(io.LimitReader(res.Body, 8<<20)).Decode(&body)
		res.Body.Close()
		if res.StatusCode == 401 || res.StatusCode == 403 {
			return nil, errors.New("BioTime rejected the backend token")
		}
		if res.StatusCode != 200 {
			return nil, fmt.Errorf("BioTime returned HTTP %d; attendance could not be loaded", res.StatusCode)
		}
		if decodeErr != nil || body.Count == nil || *body.Count < 0 || body.Code == nil || *body.Code != 0 || len(body.Data) == 0 || string(body.Data) == "null" {
			return nil, errors.New("BioTime returned an unexpected response")
		}
		if expected >= 0 && expected != *body.Count {
			return nil, errors.New("BioTime records changed while loading. Please retry")
		}
		expected = *body.Count
		var rows []T
		if json.Unmarshal(body.Data, &rows) != nil {
			return nil, errors.New("BioTime returned invalid records")
		}
		if len(rows) > 0 {
			hash := sha256.Sum256(body.Data)
			if seen[hash] {
				return nil, errors.New("BioTime repeated a page; incomplete data was not accepted")
			}
			seen[hash] = true
		}
		all = append(all, rows...)
		if len(all) > expected {
			return nil, errors.New("BioTime returned inconsistent counts")
		}
		if body.Next == nil || *body.Next == "" {
			if len(all) != expected {
				return nil, errors.New("BioTime pagination ended before all records were received")
			}
			return all, nil
		}
		if len(rows) == 0 {
			return nil, errors.New("BioTime returned an empty page before the end of the records")
		}
		next, e := url.Parse(*body.Next)
		if e != nil || next.Query().Get("page") != strconv.Itoa(page+1) {
			return nil, errors.New("BioTime returned unexpected pagination")
		}
	}
	return nil, errors.New("BioTime returned too many pages; choose a shorter date range")
}

func (a *API) AttendanceRecords(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !a.verifiedAttendanceAdmin(w, r) {
		return
	}
	id, err := strconv.ParseInt(r.URL.Query().Get("member_id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "A valid member is required")
		return
	}
	var login string
	if a.conn.QueryRow("SELECT nickname FROM attendance_members WHERE id=?", id).Scan(&login) != nil {
		writeErr(w, 404, "Attendance member not found")
		return
	}
	start, end := r.URL.Query().Get("startDate"), r.URL.Query().Get("endDate")
	first, e1 := time.Parse("2006-01-02", start)
	last, e2 := time.Parse("2006-01-02", end)
	if e1 != nil || e2 != nil || last.Before(first) || last.Sub(first) > 365*24*time.Hour {
		writeErr(w, 400, "Choose a valid date range of up to 366 days")
		return
	}
	days, err := fetchBioAttendance(r.Context(), login, start, end)
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	requirements, err := a.evaluateAttendanceDates(id, login, start, end, days)
	if err != nil {
		writeErr(w, 500, "Could not evaluate attendance requirements")
		return
	}
	total, unknown := 0, 0
	for _, day := range days {
		if day.Minutes != nil {
			total += *day.Minutes
		} else {
			unknown++
		}
	}
	writeJSON(w, 200, map[string]any{"requirements": requirements, "source": "biotime", "timezone": "Asia/Bahrain", "records": days, "daysWithRecords": len(days), "knownMinutes": total, "excludedDates": unknown, "startDate": start, "endDate": end, "fetchedAt": time.Now().UTC().Format(time.RFC3339), "warnings": []string{"Hours use BioTime’s reported daily duration. Missing records do not establish absence. Incomplete days are excluded from total hours."}})
}
func buildAttendanceDays(reports []bioReport, transactions []bioTransaction, code, login, start, end string) ([]attendanceDay, error) {
	summaries := map[string][]bioReport{}
	punches := map[string][]attendancePunch{}
	dates := map[string]bool{}
	ids := map[int64]bioTransaction{}
	validDate := func(d string) bool { _, e := time.Parse("2006-01-02", d); return e == nil && d >= start && d <= end }
	for _, row := range reports {
		if row.Code != code || !validDate(row.Date) {
			return nil, errors.New("BioTime did not respect the requested employee or date filters")
		}
		summaries[row.Date] = append(summaries[row.Date], row)
		dates[row.Date] = true
	}
	for _, row := range transactions {
		if row.Code != code || !validDate(row.Date) || (strings.TrimSpace(row.Login) != "" && !strings.EqualFold(strings.TrimSpace(row.Login), strings.TrimSpace(login))) {
			return nil, errors.New("BioTime returned a transaction outside the requested member or date range")
		}
		if row.ID <= 0 {
			return nil, errors.New("BioTime returned a transaction without an identifier")
		}
		if prev, ok := ids[row.ID]; ok {
			if prev != row {
				return nil, errors.New("BioTime returned conflicting transaction identifiers")
			}
			continue
		}
		ids[row.ID] = row
		punches[row.Date] = append(punches[row.Date], attendancePunch{Time: row.Time, State: row.State})
		dates[row.Date] = true
	}
	result := []attendanceDay{}
	for date := range dates {
		d, _ := time.Parse("2006-01-02", date)
		day := attendanceDay{Date: date, Weekday: d.Weekday().String(), Status: "recorded", Punches: punches[date]}
		if day.Punches == nil {
			day.Punches = []attendancePunch{}
		}
		sort.SliceStable(day.Punches, func(i, j int) bool { return day.Punches[i].Time < day.Punches[j].Time })
		if len(day.Punches) > 0 {
			day.FirstPunch = day.Punches[0].Time
			day.LastPunch = day.Punches[len(day.Punches)-1].Time
		}
		rows := summaries[date]
		if len(rows) == 1 {
			row := rows[0]
			day.FirstPunch = row.First
			day.LastPunch = row.Last
			day.TotalTime = row.Duration
			if minutes, ok := attendanceMinutes(row.Duration); ok {
				day.Minutes = &minutes
			}
		}
		switch {
		case len(day.Punches) == 1:
			day.Status = "incomplete"
			day.Minutes = nil
			day.Note = "Only one punch was returned; hours are not counted."
		case len(rows) > 1:
			day.Status = "incomplete"
			day.Minutes = nil
			day.Note = "Multiple daily summaries were returned; hours are not counted."
		case day.Minutes == nil:
			day.Status = "incomplete"
			day.Note = "A usable daily duration was not returned; punches are shown without calculated hours."
		case day.FirstPunch == "" || day.LastPunch == "":
			day.Status = "incomplete"
			day.Minutes = nil
			day.Note = "The daily summary is missing a punch; hours are not counted."
		}
		result = append(result, day)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date < result[j].Date })
	return result, nil
}
func attendanceMinutes(value string) (int, bool) {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) != 2 || len(parts[0]) != 2 || len(parts[1]) != 2 {
		return 0, false
	}
	for _, part := range parts {
		for _, c := range part {
			if c < '0' || c > '9' {
				return 0, false
			}
		}
	}
	h, e1 := strconv.Atoi(parts[0])
	m, e2 := strconv.Atoi(parts[1])
	if e1 != nil || e2 != nil || m > 59 || h > 24 || (h == 24 && m != 0) {
		return 0, false
	}
	return h*60 + m, true
}

func fetchBioAttendance(parent context.Context, login, start, end string) ([]attendanceDay, error) {
	key := strings.TrimSpace(os.Getenv("BIO_TIME_TOKEN"))
	employeesURL := strings.TrimSpace(os.Getenv("BIO_TIME_EMPLOYEES"))
	reportsURL := strings.TrimSpace(os.Getenv("BIO_TIME_RECORDS"))
	transactionsURL := strings.TrimSpace(os.Getenv("BIO_TIME_TRANSACTIONS"))
	if transactionsURL == "" {
		base := strings.TrimRight(strings.TrimSpace(os.Getenv("BIO_TIME_API_URL")), "/")
		if base != "" {
			transactionsURL = base + "/att/api/transactionReport/"
		}
	}
	if key == "" || employeesURL == "" || reportsURL == "" || transactionsURL == "" {
		return nil, errors.New("Configure the BioTime connection on the backend to load attendance")
	}
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()
	employees, err := bioPages[bioEmployee](ctx, employeesURL, key, url.Values{})
	if err != nil {
		return nil, err
	}
	var employee *bioEmployee
	for i := range employees {
		if strings.EqualFold(strings.TrimSpace(employees[i].Login), strings.TrimSpace(login)) {
			if employee != nil {
				return nil, errors.New("More than one BioTime employee has this Platform ID. Correct the mapping in BioTime.")
			}
			employee = &employees[i]
		}
	}
	if employee == nil || employee.ID <= 0 || employee.Code == "" {
		return nil, errors.New("No exact BioTime Platform ID matches this Reboot username. Set the employee’s Platform ID in BioTime; no attendance has been inferred.")
	}
	filters := url.Values{"employees": {strconv.FormatInt(employee.ID, 10)}, "start_date": {start}, "end_date": {end}, "departments": {"-1"}, "areas": {"-1"}, "groups": {"-1"}}
	reports, err := bioPages[bioReport](ctx, reportsURL, key, filters)
	if err != nil {
		return nil, err
	}
	transactions, err := bioPages[bioTransaction](ctx, transactionsURL, key, filters)
	if err != nil {
		return nil, err
	}
	days, err := buildAttendanceDays(reports, transactions, employee.Code, login, start, end)
	if err != nil {
		return nil, err
	}

	return days, nil
}
