import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import "../admin.css";

type Member = {
  user_id: number;
  full_name: string;
  email: string;
  role: string; // admin/supervisor/student
  role_in_board: string;
  added_at: string;
};

type User = {
  id: number;
  full_name: string;
  email: string;
  role: string;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).slice(0, 2);
  const v = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return v || "U";
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M21 21l-4.3-4.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16v12H4V6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CrownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7l5 6 4-8 4 8 5-6v12H3V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BoardMembersPage() {
  const nav = useNavigate();
  const { boardId } = useParams();
  const boardID = Number(boardId);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  async function loadMembers() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/board-members?board_id=${boardID}`);
      setMembers(res);
    } catch (e: any) {
      setErr(e.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!boardID || Number.isNaN(boardID)) return;
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardID]);

  async function searchStudents() {
    setMsg("");
    setErr("");
    setSearching(true);
    try {
      const res = await apiFetch(`/admin/students?q=${encodeURIComponent(q)}`);
      setResults(res);
    } catch (e: any) {
      setErr(e.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function addMember(userId: number) {
    setMsg("");
    setErr("");
    try {
      await apiFetch("/admin/board-members", {
        method: "POST",
        body: JSON.stringify({
          board_id: boardID,
          user_id: userId,
          role_in_board: "member",
        }),
      });
      setMsg("Member added.");
      setResults([]);
      setQ("");
      await loadMembers();
    } catch (e: any) {
      setErr(e.message || "Failed to add member");
    }
  }

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    return `Board #${boardID} • ${members.length} member(s)`;
  }, [loading, boardID, members.length]);

  function roleBadge(role: string) {
    const r = (role || "").toLowerCase();
    if (r === "admin") return { label: "admin", cls: "admRolePill admRoleAdmin", icon: <CrownIcon /> };
    if (r === "supervisor")
      return { label: "supervisor", cls: "admRolePill admRoleSup", icon: <UsersIcon /> };
    return { label: "student", cls: "admRolePill admRoleStu", icon: <UsersIcon /> };
  }

  function boardRoleBadge(roleInBoard: string) {
    const r = (roleInBoard || "").toLowerCase();
    if (r === "owner") return { label: "owner", cls: "admBoardRolePill admBoardRoleOwner" };
    return { label: r || "member", cls: "admBoardRolePill" };
  }

  return (
    <AdminLayout
      active="supervisors"
      title="Board Members"
      subtitle={subtitle}
      right={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="admGhostBtn" onClick={() => nav(-1)}>
            Back
          </button>
          <button className="admPrimaryBtn" onClick={loadMembers} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      <section className="admGrid">
        {/* Left: Search + Results */}
        <div className="admCol">
          <section className="admCard">
            <div className="admCardTitleRow" style={{ marginBottom: 0 }}>
              <div>
                <div className="admCardTitle">Add students</div>
                <div className="admMuted">Search by name or email, then add to this board.</div>
              </div>
              <span className="admPill">Add</span>
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="admSearch" style={{ minWidth: 0, flex: "1 1 320px" }}>
                <span className="admSearchIcon" aria-hidden="true">
                  <SearchIcon />
                </span>
                <input
                  className="admSearchInput"
                  placeholder="Search students…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (q.trim() && !searching) searchStudents();
                    }
                  }}
                />
              </div>

              <button className="admPrimaryBtn" onClick={searchStudents} disabled={searching || q.trim().length < 2}>
                {searching ? "Searching..." : "Search"}
              </button>

              <button
                className="admSoftBtn"
                type="button"
                onClick={() => {
                  setQ("");
                  setResults([]);
                  setErr("");
                  setMsg("");
                }}
                disabled={searching && !q.trim()}
              >
                Clear
              </button>

              <div className="admHint" style={{ marginLeft: "auto" }}>
                Tip: type at least 2 characters
              </div>
            </div>

            {err && (
              <div className="admAlert admAlertBad" style={{ marginTop: 12 }}>
                {err}
              </div>
            )}
            {msg && (
              <div className="admAlert admAlertGood" style={{ marginTop: 12 }}>
                {msg}
              </div>
            )}

            <div style={{ height: 14 }} />

            <div className="admResultsHead">
              <div style={{ fontWeight: 950 }}>Results</div>
              <span className="admPill">{results.length}</span>
            </div>

            <div style={{ height: 10 }} />

            {results.length === 0 ? (
              <div className="admMuted" style={{ fontSize: 13 }}>
                Search results will appear here.
              </div>
            ) : (
              <div className="admDirGrid">
                {results.map((u) => {
                  const rb = roleBadge(u.role);
                  return (
                    <div key={u.id} className="admRowCard">
                      <div className="admDirLeft" style={{ minWidth: 0 }}>
                        <div className="admAvatar" aria-hidden="true">
                          {initials(u.full_name)}
                        </div>

                        <div className="admDirText">
                          <div className="admDirName">{u.full_name}</div>

                          <div className="admMetaLine">
                            <span className="admMetaInline" title={u.email}>
                              <MailIcon /> {u.email}
                            </span>
                            <span className={rb.cls}>
                              <span className="admRoleIcon" aria-hidden="true">
                                {rb.icon}
                              </span>
                              {rb.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="admRowActions">
                        <button className="admOpenPill" onClick={() => addMember(u.id)} title="Add to board">
                          Add
                        </button>
                        <span className="admChevron" aria-hidden="true">
                          ›
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right: Current Members (NO stretched rows) */}
        <div className="admCol">
          <section className="admCard">
            <div className="admCardTitleRow" style={{ marginBottom: 0 }}>
              <div>
                <div className="admCardTitle">Current members</div>
                <div className="admMuted">People who can access this board.</div>
              </div>
              <span className="admPill">{loading ? "…" : members.length}</span>
            </div>

            <div style={{ height: 12 }} />

            {loading ? (
              <div className="admMuted">Loading…</div>
            ) : members.length === 0 ? (
              <div className="admMuted">No members yet.</div>
            ) : (
              <div className="admDirGrid">
                {members.map((m) => {
                  const rb = roleBadge(m.role);
                  const brb = boardRoleBadge(m.role_in_board);

                  return (
                    <div key={m.user_id} className="admRowCard">
                      <div className="admDirLeft" style={{ minWidth: 0 }}>
                        <div className="admAvatar" aria-hidden="true">
                          {initials(m.full_name)}
                        </div>

                        <div className="admDirText">
                          <div className="admDirName">{m.full_name}</div>

                          <div className="admMetaLine">
                            <span className="admMetaInline" title={m.email}>
                              <MailIcon /> {m.email}
                            </span>

                            <span className={rb.cls}>
                              <span className="admRoleIcon" aria-hidden="true">
                                {rb.icon}
                              </span>
                              {rb.label}
                            </span>

                            <span className={brb.cls}>{brb.label}</span>
                          </div>
                        </div>
                      </div>

                      <div className="admRowActions" aria-hidden="true">
                        <span className="admChevron">›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>

      {/* Same “supervisors page” vibe + fixes the stretched row issue (no tables, no fixed heights). */}
      <style>{`
        .admDirGrid{ display:grid; gap:10px; }

        .admAvatar{
          width: 40px; height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.14);
          background: rgba(15,23,42,0.05);
          display:grid;
          place-items:center;
          font-weight: 950;
          color: rgba(15,23,42,0.85);
          flex: 0 0 40px;
        }

        .admRowCard{
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(15,23,42,0.10);
          background: #fff;
          box-shadow: 0 10px 26px rgba(15,23,42,0.06);
          padding: 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 12px;
          text-align: left;
          min-height: auto; /* IMPORTANT: no stretching */
          height: auto;     /* IMPORTANT: no stretching */
          transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease, background .14s ease;
        }
        .admRowCard:hover{
          transform: translateY(-1px);
          border-color: rgba(59,130,246,0.18);
          box-shadow: 0 16px 32px rgba(59,130,246,0.10);
          background: rgba(59,130,246,0.02);
        }

        .admDirLeft{ display:flex; align-items:center; gap:12px; min-width:0; }
        .admDirText{ min-width:0; display:grid; gap:6px; }
        .admDirName{
          font-weight: 950;
          color: rgba(15,23,42,0.92);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .admMetaLine{
          display:flex;
          align-items:center;
          gap: 10px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .admMetaInline{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          color: rgba(15,23,42,0.60);
          font-size: 12px;
          font-weight: 700;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .admMetaInline svg{ display:block; opacity:.85; }

        .admRowActions{
          display:flex;
          align-items:center;
          gap: 10px;
          flex: 0 0 auto;
        }

        .admOpenPill{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(59,130,246,0.18);
          background: rgba(59,130,246,0.06);
          color: rgba(37,99,235,0.92);
          font-weight: 900;
          font-size: 12px;
          cursor: pointer;
        }

        .admChevron{
          font-size: 22px;
          color: rgba(15,23,42,0.35);
          transition: transform .14s ease, color .14s ease;
        }
        .admRowCard:hover .admChevron{
          transform: translateX(2px);
          color: rgba(37,99,235,0.75);
        }

        .admResultsHead{
          display:flex;
          align-items:center;
          justify-content:space-between;
        }

        .admHint{
          font-size: 12px;
          color: rgba(15,23,42,0.55);
          font-weight: 700;
          white-space: nowrap;
        }

        /* Role pills */
        .admRolePill{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(15,23,42,0.03);
          color: rgba(15,23,42,0.70);
          font-size: 12px;
          font-weight: 800;
        }
        .admRoleIcon{ display:grid; place-items:center; }
        .admRoleIcon svg{ display:block; }

        .admRoleAdmin{
          border-color: rgba(168,85,247,0.18);
          background: rgba(168,85,247,0.06);
          color: rgba(126,34,206,0.92);
        }
        .admRoleSup{
          border-color: rgba(37,99,235,0.18);
          background: rgba(37,99,235,0.06);
          color: rgba(37,99,235,0.92);
        }
        .admRoleStu{
          border-color: rgba(16,185,129,0.18);
          background: rgba(16,185,129,0.06);
          color: rgba(16,185,129,0.92);
        }

        /* Board role pill */
        .admBoardRolePill{
          display:inline-flex;
          align-items:center;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(15,23,42,0.03);
          color: rgba(15,23,42,0.70);
          font-size: 12px;
          font-weight: 800;
          text-transform: lowercase;
        }
        .admBoardRoleOwner{
          border-color: rgba(245,158,11,0.20);
          background: rgba(245,158,11,0.07);
          color: rgba(180,83,9,0.95);
        }

        /* Search icon compatibility */
        .admSearchIcon svg{ display:block; }

        @media (max-width: 900px){
          .admRowCard{ flex-direction: column; align-items: stretch; }
          .admRowActions{ justify-content: flex-end; }
        }
      `}</style>
    </AdminLayout>
  );
}