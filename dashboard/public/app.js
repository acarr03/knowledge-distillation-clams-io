/* ===== Overview page ===== */
if (document.getElementById('stats-page')) {
  fetch('/api/stats')
    .then((r) => r.json())
    .then((d) => {
      document.getElementById('stat-total').textContent = d.total ?? '-';
      document.getElementById('stat-reviewed').textContent = d.reviewed ?? '-';
      document.getElementById('stat-approved').textContent = d.approved ?? '-';
      document.getElementById('stat-unreviewed').textContent = d.unreviewed ?? '-';
      document.getElementById('stat-complexity').textContent = d.avg_complexity ?? '-';
      document.getElementById('stat-cost').textContent =
        d.total_cost != null ? `$${d.total_cost}` : '-';

      // Category breakdown
      const catEl = document.getElementById('category-breakdown');
      const maxCount = Math.max(...(d.categories || []).map((c) => c.count), 1);
      catEl.innerHTML = (d.categories || [])
        .map(
          (c) => `
        <div class="flex items-center gap-3">
          <span class="w-44 text-xs text-gray-400 truncate">${c.category || 'uncategorized'}</span>
          <div class="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
            <div class="bg-clams-700 h-full rounded-full" style="width:${(c.count / maxCount) * 100}%"></div>
          </div>
          <span class="text-xs text-gray-500 w-8 text-right">${c.count}</span>
        </div>`,
        )
        .join('');

      // Daily activity chart
      const chartEl = document.getElementById('daily-chart');
      const maxDay = Math.max(...(d.daily || []).map((x) => x.count), 1);
      chartEl.innerHTML = (d.daily || [])
        .map(
          (x) => `
        <div class="flex-1 flex flex-col items-center justify-end h-full" title="${x.day}: ${x.count}">
          <div class="bg-clams-700 w-full rounded-t" style="height:${(x.count / maxDay) * 100}%"></div>
        </div>`,
        )
        .join('');
    });
}

/* ===== Interactions page ===== */
if (document.getElementById('interactions-page')) {
  loadInteractions(1);
}

function loadInteractions(page) {
  const params = new URLSearchParams();
  const val = (id) => document.getElementById(id)?.value;
  if (val('f-category')) params.set('category', val('f-category'));
  if (val('f-reviewed')) params.set('reviewed', val('f-reviewed'));
  if (val('f-approved')) params.set('approved', val('f-approved'));
  if (val('f-complexity')) params.set('complexity', val('f-complexity'));
  if (val('f-search')) params.set('search', val('f-search'));
  if (val('f-from')) params.set('from', val('f-from'));
  if (val('f-to')) params.set('to', val('f-to'));
  params.set('page', page);

  fetch(`/api/interactions?${params}`)
    .then((r) => r.json())
    .then((d) => {
      document.getElementById('result-count').textContent =
        `${d.total} interactions (page ${d.page}/${d.pages || 1})`;

      const body = document.getElementById('interactions-body');
      body.innerHTML = (d.interactions || [])
        .map(
          (i) => `
        <tr class="hover:bg-gray-900/50 cursor-pointer" onclick="location.href='/interactions/${i.id}'">
          <td class="py-2 pr-3 text-gray-500">${i.id}</td>
          <td class="py-2 pr-3 max-w-md truncate">${esc(i.query_preview)}</td>
          <td class="py-2 pr-3"><span class="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-xs">${i.query_category || '-'}</span></td>
          <td class="py-2 pr-3 text-center">${i.query_complexity ?? '-'}</td>
          <td class="py-2 pr-3">
            ${i.engineer_approved ? '<span class="text-green-400 text-xs font-medium">Approved</span>' : i.engineer_reviewed ? '<span class="text-red-400 text-xs font-medium">Rejected</span>' : '<span class="text-gray-600 text-xs">Pending</span>'}
          </td>
          <td class="py-2 pr-3 text-gray-500">${i.sonnet_cost != null ? '$' + Number(i.sonnet_cost).toFixed(4) : '-'}</td>
          <td class="py-2 text-gray-500">${new Date(i.created_at).toLocaleDateString()}</td>
        </tr>`,
        )
        .join('');

      // Pagination
      const pagEl = document.getElementById('pagination');
      let btns = '';
      for (let p = 1; p <= (d.pages || 1); p++) {
        btns += `<button onclick="loadInteractions(${p})" class="${p === d.page ? 'bg-clams-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'} px-3 py-1 rounded text-sm">${p}</button>`;
      }
      pagEl.innerHTML = btns;
    });
}

/* ===== Review page ===== */
if (document.getElementById('review-page')) {
  const id = document.getElementById('review-page').dataset.id;
  loadReview(id);
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

      // Pre-fill review form
      if (d.engineer_edited_response)
        document.getElementById('r-edited').value = d.engineer_edited_response;
      if (d.review_notes)
        document.getElementById('r-notes').value = d.review_notes;

      // Badges
      const badges = document.getElementById('r-status-badges');
      badges.innerHTML = '';
      if (d.engineer_approved)
        badges.innerHTML += '<span class="bg-green-900/50 text-green-400 px-2 py-0.5 rounded text-xs">Approved</span>';
      else if (d.engineer_reviewed)
        badges.innerHTML += '<span class="bg-red-900/50 text-red-400 px-2 py-0.5 rounded text-xs">Rejected</span>';
      else
        badges.innerHTML += '<span class="bg-gray-800 text-gray-500 px-2 py-0.5 rounded text-xs">Pending</span>';

      // Metadata
      const meta = document.getElementById('r-meta');
      meta.innerHTML = [
        ['Category', d.query_category || '-'],
        ['Complexity', d.query_complexity ?? '-'],
        ['Model', d.sonnet_model || '-'],
        ['Tokens In', d.sonnet_tokens_in ?? '-'],
        ['Tokens Out', d.sonnet_tokens_out ?? '-'],
        ['Cost', d.sonnet_cost != null ? `$${Number(d.sonnet_cost).toFixed(4)}` : '-'],
        ['Latency', d.sonnet_latency_ms != null ? `${d.sonnet_latency_ms}ms` : '-'],
        ['Date', d.created_at ? new Date(d.created_at).toLocaleString() : '-'],
      ]
        .map(
          ([label, val]) => `
        <div class="bg-gray-800/50 rounded px-3 py-2">
          <div class="text-xs text-gray-500">${label}</div>
          <div class="text-sm font-medium">${val}</div>
        </div>`,
        )
        .join('');
    });
}

function submitReview(approved) {
  const id = document.getElementById('review-page').dataset.id;
  const body = {
    engineer_reviewed: true,
    engineer_approved: approved,
  };
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
    .then((d) => {
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
