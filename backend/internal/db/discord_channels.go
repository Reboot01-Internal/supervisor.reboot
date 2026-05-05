package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func UpsertBoardDiscordChannel(conn DBTX, boardID int64, channelID string) error {
	_, err := conn.Exec(`
		INSERT INTO board_discord_channels (board_id, channel_id)
		VALUES (?, ?)
		ON CONFLICT(board_id) DO UPDATE SET channel_id=excluded.channel_id
	`, boardID, strings.TrimSpace(channelID))
	return err
}

func GetBoardDiscordChannelID(conn DBTX, boardID int64) (string, error) {
	var channelID string
	err := conn.QueryRow(`
		SELECT channel_id
		FROM board_discord_channels
		WHERE board_id = ?
	`, boardID).Scan(&channelID)
	return channelID, err
}

func DeleteBoardDiscordChannel(conn DBTX, boardID int64) error {
	_, err := conn.Exec(`
		DELETE FROM board_discord_channels
		WHERE board_id = ?
	`, boardID)
	return err
}

func ListBoardDiscordMembers(conn DBTX, boardID int64) ([]models.BoardDiscordMember, error) {
	rows, err := conn.Query(`
		SELECT
			u.id,
			u.full_name,
			IFNULL(u.nickname, ''),
			IFNULL(u.discord_user_id, '')
		FROM board_members bm
		JOIN users u ON u.id = bm.user_id
		WHERE bm.board_id = ?
		ORDER BY u.full_name ASC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.BoardDiscordMember
	for rows.Next() {
		var member models.BoardDiscordMember
		if err := rows.Scan(&member.UserID, &member.FullName, &member.Nickname, &member.DiscordUserID); err != nil {
			return nil, err
		}
		out = append(out, member)
	}
	return out, nil
}

func UpdateUserDiscordID(conn DBTX, userID int64, discordUserID string) error {
	_, err := conn.Exec(`
		UPDATE users
		SET discord_user_id = NULLIF(TRIM(?), '')
		WHERE id = ?
	`, discordUserID, userID)
	return err
}

func GetUserDiscordID(conn DBTX, userID int64) (string, error) {
	var discordUserID sql.NullString
	err := conn.QueryRow(`
		SELECT discord_user_id
		FROM users
		WHERE id = ?
	`, userID).Scan(&discordUserID)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(discordUserID.String), nil
}
