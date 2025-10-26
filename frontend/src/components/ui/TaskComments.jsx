import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import io from "socket.io-client";
import {
  listTaskComments,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  getMe,
  searchMentionableUsers,
} from "../../services/api";

// ===== Constants =====
const SOCKET_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const PAGE_SIZE = 20;
const SUGGESTION_MAX_WIDTH = 576;
const Z_INDEX_SUGGESTIONS = 10000;
const AT_TOKEN_RE = /(^|[\s(])@([a-z0-9._+-]{0,64})$/i;

const LIST_CONTAINER_CLS = "space-y-3";
const ITEM_CLS = "rounded-2xl border p-3 bg-[--color-light-surface] dark:bg-[--color-dark-surface]";
const ITEM_META_CLS = "text-sm text-slate-600 dark:text-[--color-dark-text-secondary]";
const ITEM_STRONG_CLS = "text-slate-900 dark:text-[--color-dark-text-primary]";
const ITEM_EDITED_CLS = "ml-1 text-xs text-slate-500 dark:text-[--color-dark-text-muted]";
const ITEM_BODY_CLS = "mt-1 whitespace-pre-wrap text-slate-900 dark:text-[--color-dark-text-primary]";
const ITEM_ACTIONS_CLS = "mt-2 flex gap-3 text-sm text-[--color-brand-primary]";
const FORM_BTN_CLS = "rounded-xl border px-3 py-2 hover:opacity-90";

// ===== Socket =====
const socket = io(SOCKET_BASE_URL, { withCredentials: true });

// ===== Private helpers =====
const _sortDesc = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
const _dedupeById = (arr) => {
  const map = new Map();
  for (const c of arr) map.set(c._id, c);
  return Array.from(map.values()).sort(_sortDesc);
};
const _isObjectId = (s) => typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
const _isTempId = (s) => typeof s === "string" && s.startsWith("tmp-");

const _findAtToken = (value, caret) => {
  const left = value.slice(0, caret);
  const m = AT_TOKEN_RE.exec(left);
  if (!m) return null;
  const start = caret - (m[2].length + 1);
  return { query: m[2].toLowerCase(), start, end: caret };
};

const _renderWithMentions = (text) =>
  String(text)
    .split(/(@[a-z0-9._+-]{2,64})/gi)
    .map((p, i) => (p.startsWith("@") ? (
      <span key={i} className="mention-chip-inline">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    )));

const _pickUser = (me) => {
  const u = me?.user ?? me;
  if (!u || typeof u !== "object") return { id: null, name: "", email: "" };
  return {
    id: u._id ?? u.id ?? null,
    name: u.name ?? u.username ?? u.email ?? "Unknown",
    email: u.email ?? "",
  };
};

// ===== Suggestions Portal =====
const SuggestionsPortal = ({ anchorEl, open, items, loading, onPick, onClose }) => {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    const update = () => {
      if (!anchorEl) return setRect(null);
      const r = anchorEl.getBoundingClientRect();
      setRect({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorEl]);

  if (!open || !rect) return null;

  const content = (
    <div
      style={{ position: "absolute", top: rect.top + 4, left: rect.left, width: Math.min(rect.width, SUGGESTION_MAX_WIDTH), zIndex: Z_INDEX_SUGGESTIONS }}
      className="rounded-xl border bg-white shadow-lg dark:bg-neutral-900 max-h-60 overflow-auto"
      onMouseDown={(e) => e.preventDefault()}
      role="listbox"
    >
      {loading && <div className="px-3 py-2 text-xs opacity-70">Loading…</div>}
      {!loading && items.length === 0 && <div className="px-3 py-2 text-sm opacity-60">No matches</div>}
      {items.map((u) => (
        <button
          key={u._id || u.handle}
          type="button"
          className="w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => {
            onPick(u);
            onClose?.();
          }}
          role="option"
        >
          @{u.handle} <span className="text-xs text-slate-500">· {u.name}</span>
        </button>
      ))}
    </div>
  );

  return createPortal(content, document.body);
};

// ===== Component =====
const TaskComments = ({ taskId, currentUser }) => {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);

  const [me, setMe] = useState(() => (currentUser ? _pickUser(currentUser) : null));
  const [loadingMe, setLoadingMe] = useState(!currentUser);

  const textareaRef = useRef(null);
  const [text, setText] = useState("");
  const [suggest, setSuggest] = useState({ open: false, items: [], token: null });
  const [suggestLoading, setSuggestLoading] = useState(false);

  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { items: page, nextCursor: nc } = await listTaskComments(taskId, { cursor: nextCursor, limit: PAGE_SIZE });
      setItems((prev) => _dedupeById([...prev, ...page]));
      setNextCursor(nc);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadMore();
    void loadSuggestions("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setLoadingMe(true);
      getMe()
        .then((raw) => !cancelled && setMe(_pickUser(raw)))
        .catch(() => !cancelled && setMe(null))
        .finally(() => !cancelled && setLoadingMe(false));
    } else {
      setMe(_pickUser(currentUser));
      setLoadingMe(false);
    }
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    const onCreate = ({ taskId: t, comment }) => {
      if (t !== taskId) return;
      setItems((prev) => (prev.some((c) => c._id === comment._id) ? prev : _dedupeById([comment, ...prev])));
    };
    const onUpdate = ({ taskId: t, comment }) => {
      if (t !== taskId) return;
      setItems((prev) => prev.map((c) => (c._id === comment._id ? comment : c)));
    };
    const onDelete = ({ taskId: t, commentId }) => {
      if (t !== taskId) return;
      setItems((prev) => prev.filter((c) => c._id !== commentId));
    };

    socket.on("task:comment:created", onCreate);
    socket.on("task:comment:updated", onUpdate);
    socket.on("task:comment:deleted", onDelete);
    return () => {
      socket.off("task:comment:created", onCreate);
      socket.off("task:comment:updated", onUpdate);
      socket.off("task:comment:deleted", onDelete);
    };
  }, [taskId]);

  const loadSuggestions = async (q, token = null) => {
    try {
      setSuggestLoading(true);
      const list = await searchMentionableUsers(taskId, q);
      setSuggest({ open: true, items: list, token });
    } catch {
      setSuggest({ open: false, items: [], token: null });
    } finally {
      setSuggestLoading(false);
    }
  };

  const onChange = async (e) => {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    const token = _findAtToken(v, caret);
    if (!token) {
      setSuggest((s) => ({ ...s, open: false, token: null }));
      return;
    }
    if (v[0] === "@") {
      await loadSuggestions(token.query, token);
    }
  };

  const insertHandle = (u) => {
    if (!suggest.open || !suggest.token) return;
    const before = text.slice(0, suggest.token.start);
    const after = text.slice(suggest.token.end);
    const next = `${before}@${u.handle}${after} `;
    setText(next);
    setSuggest({ open: false, items: [], token: null });

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = (before + `@${u.handle} `).length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const val = text.trim();
    if (!val) return;

    if (loadingMe) {
      alert("Loading… try again in a second.");
      return;
    }
    if (!me?.id) {
      alert("You must be signed in to comment.");
      return;
    }

    const tempId = `tmp-${Date.now()}`;
    const clientKey = tempId;
    setItems((prev) => [
      {
        _id: tempId,
        body: val,
        createdAt: new Date().toISOString(),
        author: { _id: me.id, name: me.name, email: me.email },
      },
      ...prev,
    ]);

    try {
      const saved = await createTaskComment(taskId, { body: val, authorId: me.id, clientKey });
      setItems((prev) => _dedupeById(prev.map((c) => (c._id === tempId ? saved : c))));
    } catch (err) {
      setItems((prev) => prev.filter((c) => c._id !== tempId));
      alert(err?.message || "Failed to post comment");
    } finally {
      setText("");
    }
  };

  const onEdit = async (comment) => {
    if (!_isObjectId(taskId)) {
      alert("Task is still loading. Try again in a moment.");
      return;
    }
    if (!_isObjectId(comment._id) || _isTempId(comment._id)) {
      await loadMore();
      alert("Comment is syncing. Please try again.");
      return;
    }

    const next = window.prompt("Edit comment:", comment.body);
    if (!next) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === comment.body) return;

    try {
      const updated = await updateTaskComment(taskId, comment._id, { body: trimmed, authorId: me.id });
      setItems((prev) => prev.map((i) => (i._id === comment._id ? updated : i)));
    } catch (err) {
      alert(err?.message || "Failed to update comment");
    }
  };

  const onDelete = async (comment) => {
    if (!_isObjectId(taskId) || !_isObjectId(comment._id) || _isTempId(comment._id)) {
      await loadMore();
      alert("Comment is syncing. Please try again.");
      return;
    }
    if (!window.confirm("Delete this comment?")) return;
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i._id !== comment._id));
    try {
      await deleteTaskComment(taskId, comment._id, { authorId: me?.id });
    } catch (err) {
      setItems(snapshot);
      alert(err?.message || "Failed to delete comment");
    }
  };

  return (
    <div className="space-y-4">
      {/* Composer with @mentions */}
      <form onSubmit={handleSubmit} className="relative flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={onChange}
          onFocus={() => loadSuggestions("")}
          rows={2}
          placeholder="Write a comment. Use @ to mention team members."
          className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-[--color-brand-primary]"
          disabled={loadingMe}
        />
        <div className="flex justify-end">
          <button type="submit" className={FORM_BTN_CLS} disabled={loadingMe}>
            Post
          </button>
        </div>
      </form>

      <SuggestionsPortal
        anchorEl={textareaRef.current}
        open={suggest.open}
        items={suggest.items}
        loading={suggestLoading}
        onPick={insertHandle}
        onClose={() => setSuggest((s) => ({ ...s, open: false, token: null }))}
      />

      {/* List */}
      <ul className={LIST_CONTAINER_CLS}>
        {items.map((c) => {
          const ownerId = me?.id ? String(me.id) : null;
          const authorId = c.author?._id ? String(c.author._id) : null;
          const isOwner = ownerId && authorId && ownerId === authorId;
          const ready = _isObjectId(c._id);

          return (
            <li key={c._id} className={ITEM_CLS}>
              <div className={ITEM_META_CLS}>
                <strong className={ITEM_STRONG_CLS}>
                  {c.author?.name || (isOwner ? "You" : "Unknown")}
                </strong>{" "}
                · {new Date(c.createdAt).toLocaleString()}
                {c.editedAt ? <span className={ITEM_EDITED_CLS}>(edited)</span> : null}
              </div>

              <div className={ITEM_BODY_CLS}>{_renderWithMentions(c.body)}</div>

              {isOwner && (
                <div className={ITEM_ACTIONS_CLS}>
                  <button type="button" onClick={() => onEdit(c)} disabled={!ready}>
                    Edit
                  </button>
                  <button type="button" onClick={() => onDelete(c)} disabled={!ready}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {nextCursor && (
        <div className="text-center">
          <button onClick={loadMore} disabled={loading} className={FORM_BTN_CLS}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
};

export { TaskComments };

