CREATE TRIGGER IF NOT EXISTS active_board_member_insert BEFORE INSERT ON board_members
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND is_active=0)
BEGIN SELECT RAISE(ABORT, 'Inactive users cannot be assigned to boards'); END;
CREATE TRIGGER IF NOT EXISTS active_card_assignee_insert BEFORE INSERT ON card_assignments
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND is_active=0)
BEGIN SELECT RAISE(ABORT, 'Inactive users cannot be assigned to tasks'); END;
CREATE TRIGGER IF NOT EXISTS active_supervision_insert BEFORE INSERT ON supervisor_students
WHEN EXISTS(SELECT 1 FROM users WHERE id IN (NEW.student_user_id,NEW.supervisor_user_id) AND is_active=0)
BEGIN SELECT RAISE(ABORT, 'Inactive users cannot receive new assignments'); END;
CREATE TRIGGER IF NOT EXISTS active_board_owner_insert BEFORE INSERT ON boards
WHEN EXISTS(SELECT 1 FROM supervisor_files sf JOIN users u ON u.id=sf.supervisor_user_id WHERE sf.id=NEW.supervisor_file_id AND u.is_active=0)
BEGIN SELECT RAISE(ABORT, 'Inactive supervisors cannot receive new boards'); END;
CREATE TRIGGER IF NOT EXISTS active_board_owner_update BEFORE UPDATE OF supervisor_file_id ON boards
WHEN NEW.supervisor_file_id != OLD.supervisor_file_id AND EXISTS(SELECT 1 FROM supervisor_files sf JOIN users u ON u.id=sf.supervisor_user_id WHERE sf.id=NEW.supervisor_file_id AND u.is_active=0)
BEGIN SELECT RAISE(ABORT, 'Inactive supervisors cannot receive new boards'); END;
