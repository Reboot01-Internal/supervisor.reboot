package handlers

import (
	"context"
	"log"
	"os"
	"time"
)

// Check saved dates without requiring an administrator to keep the page open.
func (a *API) StartAttendanceRequirementWorker() {
	go func() {
		timer := time.NewTicker(time.Hour)
		defer timer.Stop()
		for {
			a.checkAttendanceRequirements()
			<-timer.C
		}
	}()
}
func (a *API) checkAttendanceRequirements() {
	if os.Getenv("BIO_TIME_TOKEN") == "" {
		return
	}
	today := time.Now().In(time.FixedZone("Bahrain", 3*3600)).Format("2006-01-02")
	rows, err := a.conn.Query(`SELECT m.id,m.nickname,substr(d.date,1,7) FROM attendance_dates d JOIN attendance_members m ON m.id=d.member_id WHERE m.enrolled=1 AND d.date<? GROUP BY m.id,substr(d.date,1,7)`, today)
	if err != nil {
		log.Print("Attendance requirement check could not load scheduled dates")
		return
	}
	type job struct {
		id           int64
		login, month string
	}
	jobs := []job{}
	for rows.Next() {
		var j job
		if err = rows.Scan(&j.id, &j.login, &j.month); err != nil {
			rows.Close()
			return
		}
		jobs = append(jobs, j)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return
	}
	for _, j := range jobs {
		first, err := time.Parse("2006-01-02", j.month+"-01")
		if err != nil {
			continue
		}
		end := first.AddDate(0, 1, -1).Format("2006-01-02")
		days, err := fetchBioAttendance(context.Background(), j.login, j.month+"-01", end)
		if err != nil {
			log.Printf("Attendance check unavailable for membership %d; no absence inferred", j.id)
			continue
		}
		if _, err = a.evaluateAttendanceDates(j.id, j.login, j.month+"-01", end, days); err != nil {
			log.Printf("Attendance alerts could not be saved for membership %d", j.id)
		}
	}
}
