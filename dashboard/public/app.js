/* ===== Global Org + User selectors ===== */
(function initSelectors() {
  const orgSel = document.getElementById('org-selector');
  const userSel = document.getElementById('user-selector');

  if (orgSel) {
    fetch('/api/orgs')
      .then((r) => r.json())
      .then((orgs) => {
        orgs.forEach((o) => {
          const opt = document.createElement('option');
          opt.value = o.org_id;
          opt.textContent = o.org_name || o.org_id;
          orgSel.appendChild(opt);
        });
        const saved = sessionStorage.getItem('clams_org');
        if (saved) orgSel.value = saved;
        updateExportLink();
      });
    orgSel.addEventListener('change', () => {
      sessionStorage.setItem('clams_org', orgSel.value);
      updateExportLink();
      reloadCurrent();
    });
  }

  if (userSel) {
    fetch('/api/users')
      .then((r) => r.json())
      .then((users) => {
        users.forEach((u) => {
          const opt = document.createElement('option');
          opt.value = u.user_email;
          opt.textContent = u.user_email + (u.interactions ? ` (${u.interactions})` : '');
          userSel.appendChild(opt);
        });
        const saved = sessionStorage.getItem('clams_user');
        if (saved) userSel.value = saved;
        updateExportLink();
      });
    userSel.addEventListener('change', () => {
      sessionStorage.setItem('clams_user', userSel.value);
      updateExportLink();
      reloadCurrent();
    });
  }
})();

function getOrgFilter() { return sessionStorage.getItem('clams_org') || ''; }
function getUserFilter() { return sessionStorage.getItem('clams_user') || ''; }

function withGlobalFilters(params) {
  const org = getOrgFilter();
  if (org) params.set('org', org);
  const user = getUserFilter();
  if (user) params.set('user', user);
  return params;
}

function reloadCurrent() {
  if (document.getElementById('stats-page')) loadStats();
  if (document.getElementById('interactions-page')) loadInteractions(1);
  if (document.getElementById('conversations-page')) loadConversations(1);
}

function updateExportLink() {
  const link = document.getElementById('export-link');
  if (!link) return;
  const qs = withGlobalFilters(new URLSearchParams()).toString();
  link.href = qs ? `/api/export/training?${qs}` : '/api/export/training';
}

function renderPagination(elId, d, fnName) {
  const pagEl = document.getElementById(elId);
  if (!pagEl) return;
  let btns = '';
  for (let p = 1; p <= (d.pages || 1); p++) {
    btns += `<button onclick="${fnName}(${p})" class="${p === d.page ? 'bg-clams-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'} px-3 py-1 rounded text-sm">${p}</button>`;
  }
  pagEl.innerHTML = btns;
}

function statusBadge(allApproved, allReviewed) {
  if (allApproved) return '<span class="text-green-400 text-xs font-medium">Approved</span>';
  if (allReviewed) return '<span class="text-red-400 text-xs font-medium">Rejected</span>';
  return '<span class="text-gray-600 text-xs">Pending</span>';
}

/* ===== Overview page ===== */
if (document.getElementById('stats-page')) loadStats();

function loadStats() {
  const qs = withGlobalFilters(new URLSearchParams()).toString();
  fetch(qs ? `/api/stats?${qs}` : '/api/stats')
    .then((r) => r.json())
    .then((d) => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('stat-total', d.total ?? '-');
      set('stat-reviewed', d.reviewed ?? '-');
      set('stat-approved', d.approved ?? '-');
      set('stat-unreviewed', d.unreviewed ?? '-');
      set('stat-complexity', d.avg_complexity ?? '-');
      set('stat-cost', d.total_cost != null ? `$${d.total_cost}` : '-');

      const catEl = document.getElementById('category-breakdown');
      if (catEl) {
        const maxCount = Math.max(...(d.categories || []).map((c) => c.count), 1);
        catEl.innerHTML = (d.categories || [])
          .map((c) => `
        <div class="flex items-center gap-3">
          <span class="w-44 text-xs text-gray-400 truncate">${c.category || 'uncategorized'}</span>
          <div class="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
            <div class="bg-clams-700 h-full rounded-full" style="width:${(c.count / maxCount) * 100}%"></div>
          </div>
          <span class="text-xs text-gray-500 w-8 text-right">${c.count}</span>
        </div>`)
          .join('');
      }

      const chartEl = document.getElementById('daily-chart');
      if (chartEl) {
        const maxDay = Math.max(...(d.daily || []).map((x) => x.count), 1);
        chartEl.innerHTML = (d.daily || [])
          .map((x) => `
        <div class="flex-1 flex flex-col items-center justify-end h-full" title="${x.day}: ${x.count}">
          <div class="bg-clams-700 w-full rounded-t" style="height:${(x.count / maxDay) * 100}%"></div>
        </div>`)
          .join('');
      }
    });
}

/* ===== Conversations page ===== */
if (document.getElementById('conversations-page')) loadConversations(1);

function loadConversations(page) {
  const params = new URLSearchParams();
  const val = (id) => document.getElementById(id)?.value;
  if (val('f-category')) params.set('category', val('f-category'));
  if (val('f-reviewed')) params.set('reviewed', val('f-reviewed'));
  if (val('f-approved')) params.set('approved', val('f-approved'));
  if (val('f-source')) params.set('source', val('f-source'));
  if (val('f-search')) params.set('search', val('f-search'));
  if (val('f-from')) params.set('from', val('f-from'));
  if (val('f-to')) params.set('to', val('f-to'));
  withGlobalFilters(params);
  params.set('page', page);

  fetch(`/api/conversations?${params}`)
    .then((r) => r.json())
    .then((d) => {
      document.getElementById('result-count').textContent =
        `${d.total} conversations (page ${d.page}/${d.pages || 1})`;

      const body = document.getElementById('conversations-body');
      body.innerHTML = (d.conversations || [])
        .map((c) => `
        <tr class="hover:bg-gray-900/50 cursor-pointer" onclick="location.href='/conversations/${encodeURIComponent(c.conversation_id)}'">
          <td class="py-2 pr-3 max-w-md truncate">${esc(c.first_query)}</td>
          <td class="py-2 pr-3 text-center">${c.turns}${c.turns > 1 ? '' : ''}</td>
          <td class="py-2 pr-3 text-gray-400 text-xs">${c.user_email ? esc(c.user_email) : '<span class="text-gray-600">-</span>'}</td>
          <td class="py-2 pr-3">${c.org_name ? `<span class="bg-indigo-900/50 text-indigo-400 px-2 py-0.5 rounded text-xs">${esc(c.org_name)}</span>` : '<span class="text-gray-600 text-xs">-</span>'}</td>
          <td class="py-2 pr-3"><span class="${c.source === 'widget' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'} px-2 py-0.5 rounded text-xs">${c.source || 'chat'}</span></td>
          <td class="py-2 pr-3">${statusBadge(c.all_approved, c.all_reviewed)}</td>
          <td class="py-2 text-gray-500 text-xs">${c.started ? new Date(c.started).toLocaleDateString() : '-'}</td>
        </tr>`)
        .join('');

      renderPagination('pagination', d, 'loadConversations');
    });
}

/* ===== Conversation thread review ===== */
if (document.getElementById('conversation-page')) {
  loadConversation(document.getElementById('conversation-page').dataset.cid);
}

function loadConversation(cid) {
  fetch(`/api/conversations/${encodeURIComponent(cid)}`)
    .then((r) => r.json())
    .then((d) => {
      const meta = d.meta || {};
      const turns = d.turns || [];
      const allApproved = turns.length > 0 && turns.every((t) => t.engineer_approved);
      const allReviewed = turns.length > 0 && turns.every((t) => t.engineer_reviewed);

      const badges = document.getElementById('c-status-badges');
      badges.innerHTML = allApproved
        ? '<span class="bg-green-900/50 text-green-400 px-2 py-0.5 rounded text-xs">Approved</span>'
        : allReviewed
          ? '<span class="bg-red-900/50 text-red-400 px-2 py-0.5 rounded text-xs">Rejected</span>'
          : '<span class="bg-gray-800 text-gray-500 px-2 py-0.5 rounded text-xs">Pending</span>';

      document.getElementById('c-meta').innerHTML = [
        ['User', meta.user_email || '-'],
        ['Org', meta.org_name || '-'],
        ['Source', meta.source || 'chat'],
        ['Turns', turns.length],
        ['Started', meta.started ? new Date(meta.started).toLocaleString() : '-'],
      ]
        .map(([label, v]) => `
        <div class="bg-gray-800/50 rounded px-3 py-2">
          <div class="text-xs text-gray-500">${label}</div>
          <div class="text-sm font-medium">${esc(String(v))}</div>
        </div>`)
        .join('');

      const thread = document.getElementById('c-thread');
      thread.innerHTML = turns
        .map((t, i) => {
          const respVal = t.engineer_edited_response != null ? t.engineer_edited_response : (t.sonnet_response || '');
          const ctx = [t.rag_context, t.material_context, t.compliance_context].filter(Boolean).join('\n\n---\n\n');
          return `
        <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div class="text-xs text-gray-600 mb-2">Turn ${i + 1} &middot; #${t.id}${t.query_category ? ' &middot; ' + t.query_category : ''}${t.query_complexity ? ' &middot; cmplx ' + t.query_complexity : ''}</div>
          <div class="mb-3">
            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">User</div>
            <div class="text-gray-200 whitespace-pre-wrap text-sm">${esc(t.user_query)}</div>
          </div>
          ${ctx ? `<details class="mb-3"><summary class="text-xs text-gray-600 cursor-pointer hover:text-gray-400">Context</summary><pre class="text-xs text-gray-500 whitespace-pre-wrap max-h-40 overflow-auto mt-1">${esc(ctx)}</pre></details>` : ''}
          <div>
            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assistant response ${t.engineer_edited_response != null ? '<span class="text-clams-500 normal-case">(edited)</span>' : ''}</div>
            <textarea data-turn="${t.id}" rows="6" class="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded px-3 py-2 text-sm font-mono">${esc(respVal)}</textarea>
          </div>
        </div>`;
        })
        .join('');
    });
}

function submitConversationReview(approved) {
  const cid = document.getElementById('conversation-page').dataset.cid;
  const edits = {};
  document.querySelectorAll('#c-thread textarea[data-turn]').forEach((ta) => {
    edits[ta.dataset.turn] = ta.value;
  });
  const notes = document.getElementById('c-notes').value.trim();

  fetch(`/api/conversations/${encodeURIComponent(cid)}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved, edits, review_notes: notes || null }),
  })
    .then((r) => r.json())
    .then((d) => {
      const toast = document.getElementById('c-toast');
      toast.className = `mt-3 text-sm ${approved ? 'text-green-400' : 'text-red-400'}`;
      toast.textContent = approved
        ? `Approved ${d.turns_updated} turn(s) and saved.`
        : 'Rejected and saved.';
      loadConversation(cid);
    });
}

/* ===== Interactions page (flat) ===== */
if (document.getElementById('interactions-page')) loadInteractions(1);

function loadInteractions(page) {
  const params = new URLSearchParams();
  const val = (id) => document.getElementById(id)?.value;
  if (val('f-category')) params.set('category', val('f-category'));
  if (val('f-reviewed')) params.set('reviewed', val('f-reviewed'));
  if (val('f-approved')) params.set('approved', val('f-approved'));
  if (val('f-complexity')) params.set('complexity', val('f-complexity'));
  if (val('f-source')) params.set('source', val('f-source'));
  if (val('f-search')) params.set('search', val('f-search'));
  if (val('f-from')) params.set('from', val('f-from'));
  if (val('f-to')) params.set('to', val('f-to'));
  withGlobalFilters(params);
  params.set('page', page);

  fetch(`/api/interactions?${params}`)
    .then((r) => r.json())
    .then((d) => {
      document.getElementById('result-count').textContent =
        `${d.total} interactions (page ${d.page}/${d.pages || 1})`;

      const body = document.getElementById('interactions-body');
      body.innerHTML = (d.interactions || [])
        .map((i) => `
        <tr class="hover:bg-gray-900/50 cursor-pointer" onclick="location.href='/interactions/${i.id}'">
          <td class="py-2 pr-3 text-gray-500">${i.id}</td>
          <td class="py-2 pr-3 max-w-md truncate">${esc(i.query_preview)}</td>
          <td class="py-2 pr-3"><span class="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-xs">${i.query_category || '-'}</span></td>
          <td class="py-2 pr-3 text-center">${i.query_complexity ?? '-'}</td>
          <td class="py-2 pr-3">${i.org_name ? `<span class="bg-indigo-900/50 text-indigo-400 px-2 py-0.5 rounded text-xs">${esc(i.org_name)}</span>` : '<span class="text-gray-600 text-xs">-</span>'}</td>
          <td class="py-2 pr-3 text-gray-400 text-xs">${i.user_email ? esc(i.user_email) : '<span class="text-gray-600">-</span>'}</td>
          <td class="py-2 pr-3"><span class="${i.source === 'widget' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'} px-2 py-0.5 rounded text-xs">${i.source || 'chat'}</span></td>
          <td class="py-2 pr-3">
            ${i.engineer_approved ? '<span class="text-green-400 text-xs font-medium">Approved</span>' : i.engineer_reviewed ? '<span class="text-red-400 text-xs font-medium">Rejected</span>' : '<span class="text-gray-600 text-xs">Pending</span>'}
          </td>
          <td class="py-2 pr-3 text-gray-500">${i.sonnet_cost != null ? '$' + Number(i.sonnet_cost).toFixed(4) : '-'}</td>
          <td class="py-2 text-gray-500">${new Date(i.created_at).toLocaleDateString()}</td>
        </tr>`)
        .join('');

      renderPagination('pagination', d, 'loadInteractions');
    });
}

/* ===== Single interaction review page ===== */
if (document.getElementById('review-page')) {
  loadReview(document.getElementById('review-page').dataset.id);
}

function loadReview(id) {
  fetch(`/api/interactions/${id}`)
    .then((r) => r.json())
    .then((d) => {
      document.getElementById('r-id').textContent = d.id;
      document.getElementById('r-query').textContent = d.user_query;
      document.getElementById('r-response').textContent = d.sonnet_response || '(no response)';
      document.getElementById('r-rag').textContent = d.rag_context || 'None';
      document.getElementById('r-material').textContent = d.material_context || 'None';
      document.getElementById('r-compliance').textContent = d.compliance_context || 'None';

      if (d.engineer_edited_response)
        document.getElementById('r-edited').value = d.engineer_edited_response;
      if (d.review_notes)
        document.getElementById('r-notes').value = d.review_notes;

      const badges = document.getElementById('r-status-badges');
      badges.innerHTML = d.engineer_approved
        ? '<span class="bg-green-900/50 text-green-400 px-2 py-0.5 rounded text-xs">Approved</span>'
        : d.engineer_reviewed
          ? '<span class="bg-red-900/50 text-red-400 px-2 py-0.5 rounded text-xs">Rejected</span>'
          : '<span class="bg-gray-800 text-gray-500 px-2 py-0.5 rounded text-xs">Pending</span>';

      const meta = document.getElementById('r-meta');
      meta.innerHTML = [
        ['Category', d.query_category || '-'],
        ['Complexity', d.query_complexity ?? '-'],
        ['Org', d.org_name || '-'],
        ['User', d.user_email || '-'],
        ['Source', d.source || 'chat'],
        ['Model', d.sonnet_model || '-'],
        ['Tokens In', d.sonnet_tokens_in ?? '-'],
        ['Tokens Out', d.sonnet_tokens_out ?? '-'],
        ['Cost', d.sonnet_cost != null ? `$${Number(d.sonnet_cost).toFixed(4)}` : '-'],
        ['Latency', d.sonnet_latency_ms != null ? `${d.sonnet_latency_ms}ms` : '-'],
        ['Date', d.created_at ? new Date(d.created_at).toLocaleString() : '-'],
      ]
        .map(([label, v]) => `
        <div class="bg-gray-800/50 rounded px-3 py-2">
          <div class="text-xs text-gray-500">${label}</div>
          <div class="text-sm font-medium">${esc(String(v))}</div>
        </div>`)
        .join('');
    });
}

function submitReview(approved) {
  const id = document.getElementById('review-page').dataset.id;
  const body = { engineer_reviewed: true, engineer_approved: approved };
  const edited = document.getElementById('r-edited').value.trim();
  if (edited) body.engineer_edited_response = edited;
  const notes = document.getElementById('r-notes').value.trim();
  if (notes) body.review_notes = notes;

  fetch(`/api/interactions/${id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .then(() => {
      const toast = document.getElementById('r-toast');
      toast.className = `mt-3 text-sm ${approved ? 'text-green-400' : 'text-red-400'}`;
      toast.textContent = approved ? 'Approved and saved.' : 'Rejected and saved.';
      loadReview(id);
    });
}

function navReview(direction) {
  const current = parseInt(document.getElementById('review-page').dataset.id, 10);
  const next = current + direction;
  if (next < 1) return;
  location.href = `/interactions/${next}`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

/* ===== AI Chat test bench (local Ollama) ===== */
let aiMessages = [];
if (document.getElementById('aichat-page')) initAiChat();

function initAiChat() {
  const sel = document.getElementById('ai-model');
  fetch('/api/aichat/models')
    .then((r) => r.json())
    .then((d) => {
      if (d.models && d.models.length) {
        d.models.forEach((m) => {
          const o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          sel.appendChild(o);
        });
        sel.value = d.models.find((m) => m.startsWith('qwen3.6')) || d.models[0];
      } else {
        sel.innerHTML = '<option value="">(no local models found)</option>';
      }
    })
    .catch(() => { sel.innerHTML = '<option value="">(Ollama unreachable)</option>'; });

  document.getElementById('ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); }
  });
}

function aiRenderTranscript() {
  const el = document.getElementById('ai-transcript');
  el.innerHTML = aiMessages
    .map((m) => {
      const isUser = m.role === 'user';
      return `<div class="bg-gray-900 rounded-lg border ${isUser ? 'border-gray-800' : 'border-clams-700/30'} p-4">
        <div class="text-xs font-semibold uppercase tracking-wide mb-1 ${isUser ? 'text-gray-500' : 'text-clams-500'}">${isUser ? 'You' : 'Model'}</div>
        ${m.thinking ? `<details class="mb-2" open><summary class="text-xs text-gray-600 cursor-pointer">Thinking</summary><pre class="text-xs text-gray-500 whitespace-pre-wrap mt-1 max-h-64 overflow-auto">${esc(m.thinking)}</pre></details>` : ''}
        <div class="text-gray-200 whitespace-pre-wrap text-sm">${esc(m.content) || '<span class="text-gray-600">…</span>'}</div>
        ${m.meta ? `<div class="text-xs text-gray-600 mt-2">${esc(m.meta)}</div>` : ''}
      </div>`;
    })
    .join('');
  window.scrollTo(0, document.body.scrollHeight);
}

async function aiSend() {
  const input = document.getElementById('ai-input');
  const text = input.value.trim();
  if (!text) return;
  const model = document.getElementById('ai-model').value;
  const system = document.getElementById('ai-system').value.trim();
  const sendBtn = document.getElementById('ai-send');

  aiMessages.push({ role: 'user', content: text });
  input.value = '';

  const payload = [];
  if (system) payload.push({ role: 'system', content: system });
  aiMessages.forEach((m) => payload.push({ role: m.role, content: m.content }));

  const assistant = { role: 'assistant', content: '', thinking: '', meta: '' };
  aiMessages.push(assistant);
  aiRenderTranscript();
  sendBtn.disabled = true;
  sendBtn.textContent = '…';
  const started = Date.now();

  try {
    const resp = await fetch('/api/aichat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: payload }),
    });
    if (!resp.ok || !resp.body) {
      const e = await resp.json().catch(() => ({ error: 'stream failed' }));
      assistant.content = `[error] ${e.error || resp.status}`;
      aiRenderTranscript();
      return;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        if (obj.message) {
          if (obj.message.thinking) assistant.thinking += obj.message.thinking;
          if (obj.message.content) assistant.content += obj.message.content;
        }
        if (obj.done) {
          const secs = ((Date.now() - started) / 1000).toFixed(1);
          const outTok = obj.eval_count || 0;
          const tps = obj.eval_duration ? (outTok / (obj.eval_duration / 1e9)).toFixed(1) : '?';
          assistant.meta = `${obj.model || model} · ${outTok} tok · ${tps} tok/s · ${secs}s`;
        }
        aiRenderTranscript();
      }
    }
  } catch (err) {
    assistant.content += `\n[connection error: ${err.message}]`;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    aiRenderTranscript();
  }
}

function aiClear() {
  aiMessages = [];
  aiRenderTranscript();
}
