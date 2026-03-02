import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { apiFetch } from "../lib/api";
import "../admin.css";

type Board = {
  id: number;
  supervisor_file_id: number;
  name: string;
  description: string;
  created_by: number;
  created_at: string;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).slice(0, 2);
  const v = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return v || "B";
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.9"
      />
      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

export default function SupervisorFilePage() {
  const nav = useNavigate();
  const { fileId } = useParams();
  const fileID = Number(fileId);

  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadBoards() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/boards?file_id=${fileID}`);
      setBoards(res);
    } catch (e: any) {
      setErr(e.message || "Failed to load boards");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!fileID || Number.isNaN(fileID)) return;
    loadBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileID]);

  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setCreating(true);

    try {
      await apiFetch("/admin/boards", {
        method: "POST",
        body: JSON.stringify({
          supervisor_file_id: fileID,
          name,
          description,
        }),
      });

      setMsg("Board created.");
      setName("");
      setDescription("");
      await loadBoards();
    } catch (e: any) {
      setErr(e.message || "Failed to create board");
    } finally {
      setCreating(false);
    }
  }

  const boardsSorted = useMemo(() => {
    return [...boards].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [boards]);

  return (
    <AdminLayout
      active="supervisors"
      title="Workspace"
      subtitle={loading ? "Loading…" : `Supervisor File #${fileID} • ${boards.length} board(s)`}
      right={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="admGhostBtn" onClick={() => nav("/admin/supervisors")}>
            Back
          </button>
          <button className="admPrimaryBtn" onClick={loadBoards} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      <section className="admGrid">
        {/* Left: Create Board (keep your current structure) */}
        <div className="admCol">
          <section className="admCard">
            <div className="admCardTitleRow">
              <div>
                <div className="admCardTitle">Create board</div>
                <div className="admMuted">Name + optional description.</div>
              </div>
              <span className="admPill">New</span>
            </div>

            <form onSubmit={createBoard} className="admForm">
              <div className="admRow2">
                <label className="admField" style={{ gridColumn: "1 / -1" }}>
                  <span className="admLabel">Board name</span>
                  <input
                    className="admInput"
                    placeholder="e.g. Sprint Planning"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>

                <label className="admField" style={{ gridColumn: "1 / -1" }}>
                  <span className="admLabel">Description</span>
                  <input
                    className="admInput"
                    placeholder="Optional"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>

              {err && <div className="admAlert admAlertBad">{err}</div>}
              {msg && <div className="admAlert admAlertGood">{msg}</div>}

              <div className="admFormActions">
                <button className="admPrimaryBtn" disabled={creating || !name.trim()}>
                  {creating ? "Creating..." : "Create"}
                </button>

                <button
                  type="button"
                  className="admSoftBtn"
                  onClick={() => {
                    setName("");
                    setDescription("");
                    setErr("");
                    setMsg("");
                  }}
                >
                  Clear
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right: Boards list (minimal + professional like supervisors page) */}
        <div className="admCol">
          <section className="admCard">
            <div className="admCardTitleRow" style={{ marginBottom: 0 }}>
              <div>
                <div className="admCardTitle">Boards</div>
                <div className="admMuted">Open a board or manage members.</div>
              </div>

              <span className="admPill">{loading ? "…" : boards.length}</span>
            </div>

            <div style={{ height: 12 }} />

            {err && (
              <div className="admAlert admAlertBad" style={{ marginBottom: 12 }}>
                {err}
              </div>
            )}

            {loading ? (
              <div className="admMuted">Loading…</div>
            ) : boardsSorted.length === 0 ? (
              <div className="admMuted">No boards yet.</div>
            ) : (
              <div className="admDirGrid">
                {boardsSorted.map((b) => {
                  const created = new Date(b.created_at);
                  const desc = (b.description || "").trim();

                  return (
                    <div key={b.id} className="admBoardRow">
                      <div className="admDirLeft" style={{ minWidth: 0 }}>
                        <div className="admAvatar" aria-hidden="true">
                          {initials(b.name)}
                        </div>

                        <div className="admDirText">
                          <div className="admDirName">{b.name}</div>

                          {/* ONE clean meta line only */}
                          <div className="admBoardMetaLine">
                            <span className="admMetaInline">
                              <ClockIcon /> {created.toLocaleDateString()}
                            </span>

                            {desc ? (
                              <>
                                <span className="admMetaDot">•</span>
                                <span className="admMetaInline" title={desc}>
                                  {desc}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="admBoardActions">
                        <button
                          className="admOpenPill"
                          type="button"
                          onClick={() => nav(`/admin/boards/${b.id}`)}
                          title="Open board"
                        >
                          Open
                        </button>

                        <button
                          className="admIconPill"
                          type="button"
                          onClick={() => nav(`/admin/boards/${b.id}/members`)}
                          title="Members"
                          aria-label="Members"
                        >
                          <UsersIcon />
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
      </section>

      <style>{`
        /* shared look (same vibe as supervisors page) */
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

        .admBoardRow{
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
          transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease, background .14s ease;
        }
        .admBoardRow:hover{
          transform: translateY(-1px);
          border-color: rgba(59,130,246,0.18);
          box-shadow: 0 16px 32px rgba(59,130,246,0.10);
          background: rgba(59,130,246,0.02);
        }

        .admDirLeft{
          display:flex;
          align-items:center;
          gap: 12px;
          min-width: 0;
        }
        .admDirText{ min-width:0; display:grid; gap:6px; }

        .admDirName{
          font-weight: 950;
          color: rgba(15,23,42,0.92);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* minimal meta line (no pills) */
        .admBoardMetaLine{
          display:flex;
          align-items:center;
          gap: 8px;
          min-width: 0;
          color: rgba(15,23,42,0.60);
          font-size: 12px;
          font-weight: 700;
        }
        .admMetaInline{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .admMetaInline svg{ display:block; opacity: .85; }
        .admMetaDot{ opacity: .55; }

        .admBoardActions{
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

        /* members icon button (clean, no bubble stack) */
        .admIconPill{
          width: 38px; height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(15,23,42,0.03);
          color: rgba(15,23,42,0.72);
          display:grid;
          place-items:center;
          cursor:pointer;
          transition: transform .14s ease, border-color .14s ease, background .14s ease;
        }
        .admIconPill:hover{
          transform: translateY(-1px);
          border-color: rgba(16,185,129,0.18);
          background: rgba(16,185,129,0.06);
        }
        .admIconPill svg{ display:block; }

        .admChevron{
          font-size: 22px;
          color: rgba(15,23,42,0.35);
          transition: transform .14s ease, color .14s ease;
        }
        .admBoardRow:hover .admChevron{
          transform: translateX(2px);
          color: rgba(37,99,235,0.75);
        }

        @media (max-width: 900px){
          .admBoardRow{ flex-direction: column; align-items: stretch; }
          .admBoardActions{ justify-content: flex-end; }
        }
      `}</style>
    </AdminLayout>
  );
}