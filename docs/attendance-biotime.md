# Direct BioTime attendance

Attendance is fetched by the TaskFlow backend, without SIS. Configure private backend environment variables:

```dotenv
BIO_TIME_API_URL=http://biotime.reboot01.com
BIO_TIME_EMPLOYEES=http://10.1.50.4/personnel/api/employees/
BIO_TIME_RECORDS=http://biotime.reboot01.com/att/api/firstLastReport/
BIO_TIME_TRANSACTIONS=http://biotime.reboot01.com/att/api/transactionReport/
BIO_TIME_TOKEN=<private provider token>
```

Restart the backend after changing configuration. The backend needs network access to both hosts. No BioTime username/password is required when the token works. Never expose these credentials in frontend environment variables or commit `.env`.

`GET /admin/attendance/records?member_id=ID&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` requires a Reboot Bearer session verified against the configured SCHOOL_URL and an active local admin account. Client identity headers alone do not grant record access.

The saved member nickname is matched to BioTime's Platform ID. Missing or ambiguous matches fail explicitly. The matched internal employee ID is used to query both reports, with explicit date bounds and all areas/departments/groups. Every page is retrieved; inconsistent counts, repeated pages, and incomplete responses fail rather than returning partial totals. Provider `next` hosts are never followed with credentials.

The calendar uses Bahrain dates and shows individual transaction punches. Hours come from BioTime `total_time`, labelled reported hours: this does not certify how BioTime itself calculates breaks. First-to-last time is not calculated locally. Single punches, unusable durations, missing summary punches, and duplicate daily summaries are incomplete and excluded from hour totals. Identical transaction IDs are deduplicated; conflicting IDs fail. A day without records is not labelled absent. Days with records are distinct dates, not proof that a requirement was met.

Weekly/monthly per-member requirements remain editable separately. Schedule, leave, minimum qualifying daily hours, overnight attendance rules, and confirmed provider duration semantics must be defined before compliance calculations are added.

Validation: live read-only checks confirmed Platform ID mapping, employee/date filtering, and HH:MM report values. Automated tests cover provider pagination, incomplete data, duplicate records, member/date scope, missing session rejection, reported-duration totals, and requirement edits. Live browser-to-backend session flow still requires testing in the running application.

## Date requirements

Admins select explicit dates and required hours per date using `/admin/attendance/dates` (GET and POST, verified Reboot admin session). The saved list supports editing and removal. The previous period targets remain in their original table but do not generate date obligations.

Required dates are compared with usable BioTime minutes. Future dates are scheduled, today remains in progress until met, and past dates become met, below target, no record (review), or incomplete (review). Notifications deliberately request review, not a definitive absence judgment.

The backend checks enrolled members' required months at startup and hourly while the server runs. A successful calendar fetch also checks the displayed month; an open calendar refreshes every five minutes. Provider failures never create absence notifications. Alerts are persisted to the existing admin notification inbox and deduplicated by member/date/status. Historical notifications remain as a record even when a later sync or requirement edit changes the current status. Restart the backend to apply migration 023 and start the worker. Email, push, and external messaging are not configured.
