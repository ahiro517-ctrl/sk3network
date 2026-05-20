/* sk3 人脈マップ - 描画ロジック
 * - スプレッドシートの 4 シート(人/プロジェクト/テーマ/関わり)を CSV で取得
 * - D3 force simulation で関係図を描画
 * - 内部ビューのみ(現状)
 */

(function () {
  'use strict';

  // ---------- 設定読み込み ----------
  const cfg = window.SK3_CONFIG;
  if (!cfg || !cfg.spreadsheetId || cfg.spreadsheetId === 'YOUR_SPREADSHEET_ID') {
    setStatus('config.js が未設定です。config.example.js をコピーして spreadsheetId と gids を埋めてください。', true);
    return;
  }

  const csvUrl = (gid) =>
    `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/export?format=csv&gid=${gid}`;

  // ---------- 状態 ----------
  const state = {
    raw: { people: [], projects: [], themes: [], relations: [] },
    nodes: [],
    links: [],
    filter: {
      role: new Set(['事務局', 'コアメン', 'フォロワー']),
      type: new Set(['person', 'project', 'theme']),
      themeState: new Set(['募集中', '実現した']),
    },
    selected: null,
    simulation: null,
  };

  // ---------- DOM ----------
  const svg = d3.select('#graph');
  const detailsEl = document.getElementById('details');
  const detailsBody = document.getElementById('details-body');
  document.getElementById('details-close').addEventListener('click', closeDetails);
  document.getElementById('reload-btn').addEventListener('click', loadAndRender);

  document.querySelectorAll('input[type="checkbox"][data-filter]').forEach(cb => {
    cb.addEventListener('change', () => {
      const set = state.filter[cb.dataset.filter];
      if (cb.checked) set.add(cb.value);
      else set.delete(cb.value);
      applyFilter();
    });
  });

  // ---------- 起動 ----------
  loadAndRender();

  async function loadAndRender() {
    setStatus('スプレッドシートを読み込み中...');
    try {
      const [people, projects, themes, relations] = await Promise.all([
        fetchCsv(cfg.gids.people),
        fetchCsv(cfg.gids.projects),
        fetchCsv(cfg.gids.themes),
        fetchCsv(cfg.gids.relations),
      ]);
      state.raw = { people, projects, themes, relations };
      buildGraph();
      renderHints();
      render();
      setStatus(`${state.nodes.length} ノード / ${state.links.length} リンクを表示中`);
    } catch (err) {
      console.error(err);
      setStatus(`読み込みエラー: ${err.message}`, true);
    }
  }

  async function fetchCsv(gid) {
    const res = await fetch(csvUrl(gid), { cache: 'no-store' });
    if (!res.ok) throw new Error(`gid=${gid} の取得に失敗 (${res.status})`);
    const text = await res.text();
    return d3.csvParse(text);
  }

  // ---------- グラフ構築 ----------
  function buildGraph() {
    const { people, projects, themes, relations } = state.raw;
    const nodes = [];
    const links = [];

    const peopleById = new Map();
    const projectsById = new Map();
    const themesById = new Map();

    people.forEach(p => {
      if (!p.ID || !p.表示名) return;
      const node = {
        id: p.ID,
        kind: 'person',
        label: p.表示名,
        role: p.立場 || 'フォロワー',
        sk3: p.sk3所属,
        skills: (p.スキル || '').split(/[、,\s]+/).filter(Boolean),
        company: p.所属企業,
        met: p.知り合った日,
        note: p.ひとこと,
        relations: [],
      };
      nodes.push(node);
      peopleById.set(p.ID, node);
    });

    projects.forEach(p => {
      if (!p.ID || !p.プロジェクト名) return;
      const node = {
        id: p.ID,
        kind: 'project',
        label: p.プロジェクト名,
        official: p.公式区分 === '公式',
        origin: p.発信元,
        open: p.オープン === 'オープン',
        invite: p.関わりしろ,
        summary: p.概要,
        status: p.ステータス,
        members: [],
      };
      nodes.push(node);
      projectsById.set(p.ID, node);
    });

    themes.forEach(t => {
      if (!t.ID || !t.テーマ名) return;
      const node = {
        id: t.ID,
        kind: 'theme',
        label: t.テーマ名,
        starter: t.言い出した人,
        description: t.説明,
        state: t.状態 || '募集中',
        expires: t.有効期限,
        members: [],
      };
      nodes.push(node);
      themesById.set(t.ID, node);
    });

    relations.forEach(r => {
      if (!r.人ID || !r.対象ID) return;
      const person = peopleById.get(r.人ID);
      if (!person) return;
      const target = r.対象種別 === 'プロジェクト'
        ? projectsById.get(r.対象ID)
        : themesById.get(r.対象ID);
      if (!target) return;
      const kind = r.関わり方 || 'メンバー';
      const link = {
        source: person.id,
        target: target.id,
        kind,
      };
      links.push(link);
      person.relations.push({ targetId: target.id, kind });
      target.members.push({ personId: person.id, kind });
    });

    state.nodes = nodes;
    state.links = links;
  }

  // ---------- 描画 ----------
  let g, linkSel, nodeSel;

  function render() {
    svg.selectAll('*').remove();

    const width = svg.node().clientWidth;
    const height = svg.node().clientHeight;

    // 矢印やパルスを定義する defs(現状未使用だが拡張用)
    svg.append('defs');

    // ズーム用ラッパ
    g = svg.append('g').attr('class', 'viewport');

    svg.call(d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', ev => g.attr('transform', ev.transform)));

    const links = filteredLinks();
    const nodes = filteredNodes();

    // リンク
    linkSel = g.append('g').attr('class', 'links')
      .selectAll('line')
      .data(links, d => `${idOf(d.source)}__${idOf(d.target)}__${d.kind}`)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke', d => linkColor(d.kind))
      .attr('stroke-width', d => linkWidth(d.kind))
      .attr('stroke-dasharray', d => d.kind === '関心あり' ? '3 4' : null);

    // ノード
    nodeSel = g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(nodes, d => d.id)
      .enter().append('g')
      .attr('class', d => `node node-${d.kind}`)
      .call(dragBehavior())
      .on('click', (ev, d) => { ev.stopPropagation(); openDetails(d); });

    // 人 = 円
    nodeSel.filter(d => d.kind === 'person')
      .append('circle')
      .attr('r', d => 8 + Math.min(8, d.relations?.length || 0))
      .attr('fill', d => roleColor(d.role))
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 1.5);

    // プロジェクト = 四角(公式=実線、非公式=破線)
    const proj = nodeSel.filter(d => d.kind === 'project');
    proj.each(function (d) {
      const size = 16 + Math.min(12, d.members.length * 2);
      d._size = size;
    });
    proj.append('rect')
      .attr('x', d => -d._size / 2)
      .attr('y', d => -d._size / 2)
      .attr('width', d => d._size)
      .attr('height', d => d._size)
      .attr('fill', d => d.official ? 'rgba(34, 211, 238, 0.15)' : 'rgba(148, 163, 184, 0.1)')
      .attr('stroke', d => d.official ? COLORS.projectOfficial : COLORS.projectUnofficial)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', d => d.official ? null : '4 3');

    // テーマ = ひし形
    const theme = nodeSel.filter(d => d.kind === 'theme');
    theme.each(function (d) {
      const size = 14 + Math.min(10, d.members.length * 2);
      d._size = size;
    });
    theme.append('path')
      .attr('d', d => diamondPath(d._size))
      .attr('fill', d => themeFill(d.state))
      .attr('stroke', d => themeStroke(d.state))
      .attr('stroke-width', 2);

    // 募集中テーマにパルスリング
    theme.filter(d => d.state === '募集中')
      .append('circle')
      .attr('class', 'pulse-ring')
      .attr('r', d => d._size * 0.9);

    // ラベル
    nodeSel.append('text')
      .attr('class', 'node-label')
      .attr('dy', d => labelOffset(d))
      .attr('text-anchor', 'middle')
      .text(d => d.label);

    // 背景クリックで詳細パネルを閉じる
    svg.on('click', closeDetails);

    // シミュレーション
    state.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => d.kind === 'コア' ? 80 : 110).strength(d => d.kind === 'コア' ? 0.8 : 0.4))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(d => (d._size || 16) + 6))
      .on('tick', ticked);
  }

  function ticked() {
    linkSel
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
  }

  function dragBehavior() {
    return d3.drag()
      .on('start', (ev, d) => {
        if (!ev.active) state.simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end', (ev, d) => {
        if (!ev.active) state.simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      });
  }

  // ---------- 見た目ヘルパ(SVG 属性は CSS 変数を解決しないため直値) ----------
  const COLORS = {
    roleStaff: '#f97316',
    roleCore: '#38bdf8',
    roleFollower: '#a78bfa',
    themeOpen: '#f59e0b',
    themeDone: '#64748b',
    themeEnded: '#475569',
    projectOfficial: '#22d3ee',
    projectUnofficial: '#94a3b8',
    linkCore: '#f8fafc',
    linkMember: '#94a3b8',
    linkInterest: '#64748b',
  };
  function roleColor(role) {
    return role === '事務局' ? COLORS.roleStaff
      : role === 'コアメン' ? COLORS.roleCore
      : COLORS.roleFollower;
  }
  function themeFill(s) {
    if (s === '実現した') return 'rgba(100, 116, 139, 0.6)';
    if (s === '終了') return 'rgba(71, 85, 105, 0.3)';
    return 'rgba(245, 158, 11, 0.25)';
  }
  function themeStroke(s) {
    if (s === '実現した') return COLORS.themeDone;
    if (s === '終了') return COLORS.themeEnded;
    return COLORS.themeOpen;
  }
  function linkColor(kind) {
    if (kind === 'コア') return COLORS.linkCore;
    if (kind === '関心あり') return COLORS.linkInterest;
    return COLORS.linkMember;
  }
  function linkWidth(kind) {
    if (kind === 'コア') return 3;
    if (kind === '関心あり') return 1;
    return 1.5;
  }
  function diamondPath(s) {
    const h = s / 2;
    return `M0,${-h} L${h},0 L0,${h} L${-h},0 Z`;
  }
  function labelOffset(d) {
    if (d.kind === 'person') return (8 + Math.min(8, d.relations?.length || 0)) + 12;
    return (d._size || 16) / 2 + 12;
  }
  function idOf(x) { return typeof x === 'object' ? x.id : x; }

  // ---------- フィルタ ----------
  function filteredNodes() {
    return state.nodes.filter(n => {
      if (!state.filter.type.has(n.kind)) return false;
      if (n.kind === 'person' && !state.filter.role.has(n.role)) return false;
      if (n.kind === 'theme' && !state.filter.themeState.has(n.state)) return false;
      return true;
    });
  }
  function filteredLinks() {
    const visible = new Set(filteredNodes().map(n => n.id));
    return state.links.filter(l => visible.has(idOf(l.source)) && visible.has(idOf(l.target)));
  }
  function applyFilter() {
    render();
  }

  // ---------- 詳細パネル ----------
  function openDetails(d) {
    state.selected = d;
    detailsBody.innerHTML = renderDetails(d);
    detailsEl.setAttribute('aria-hidden', 'false');
  }
  function closeDetails() {
    detailsEl.setAttribute('aria-hidden', 'true');
    state.selected = null;
  }

  function renderDetails(d) {
    if (d.kind === 'person') {
      const rels = d.relations.map(r => {
        const target = state.nodes.find(n => n.id === r.targetId);
        return target
          ? `<li>${escapeHtml(target.label)} <small>(${target.kind === 'project' ? 'プロジェクト' : 'テーマ'} / ${r.kind})</small></li>`
          : '';
      }).join('');
      return `
        <h3>${escapeHtml(d.label)}</h3>
        <div><span class="badge">${escapeHtml(d.role)}</span><span class="badge">sk3所属: ${escapeHtml(d.sk3 || '-')}</span></div>
        <dl>
          ${d.skills.length ? `<dt>スキル</dt><dd>${d.skills.map(escapeHtml).join(' / ')}</dd>` : ''}
          ${d.company ? `<dt>所属企業</dt><dd>${escapeHtml(d.company)}</dd>` : ''}
          ${d.met ? `<dt>知り合った</dt><dd>${escapeHtml(d.met)}</dd>` : ''}
          ${d.note ? `<dt>ひとこと</dt><dd>${escapeHtml(d.note)}</dd>` : ''}
          ${rels ? `<dt>関わり</dt><dd><ul class="relations">${rels}</ul></dd>` : ''}
        </dl>`;
    }
    if (d.kind === 'project') {
      const members = d.members.map(m => {
        const p = state.nodes.find(n => n.id === m.personId);
        return p ? `<li>${escapeHtml(p.label)} <small>(${m.kind})</small></li>` : '';
      }).join('');
      return `
        <h3>${escapeHtml(d.label)}</h3>
        <div>
          <span class="badge">${d.official ? '公式' : '非公式'}</span>
          <span class="badge">${escapeHtml(d.origin || '')}</span>
          <span class="badge">${d.open ? 'オープン' : 'クローズ'}</span>
          ${d.status ? `<span class="badge">${escapeHtml(d.status)}</span>` : ''}
        </div>
        <dl>
          ${d.summary ? `<dt>概要</dt><dd>${escapeHtml(d.summary)}</dd>` : ''}
          ${d.open && d.invite ? `<dt>関わりしろ</dt><dd>${escapeHtml(d.invite)}</dd>` : ''}
          ${members ? `<dt>参加者</dt><dd><ul class="relations">${members}</ul></dd>` : ''}
        </dl>`;
    }
    if (d.kind === 'theme') {
      const starter = state.nodes.find(n => n.id === d.starter);
      const members = d.members.map(m => {
        const p = state.nodes.find(n => n.id === m.personId);
        return p ? `<li>${escapeHtml(p.label)} <small>(${m.kind})</small></li>` : '';
      }).join('');
      return `
        <h3>${escapeHtml(d.label)}</h3>
        <div><span class="badge">${escapeHtml(d.state)}</span>${d.expires ? `<span class="badge">期限: ${escapeHtml(d.expires)}</span>` : ''}</div>
        <dl>
          ${d.description ? `<dt>説明</dt><dd>${escapeHtml(d.description)}</dd>` : ''}
          ${starter ? `<dt>言い出した人</dt><dd>${escapeHtml(starter.label)}</dd>` : ''}
          ${members ? `<dt>関わる人</dt><dd><ul class="relations">${members}</ul></dd>` : ''}
        </dl>`;
    }
    return '';
  }

  // ---------- ヒント(俯瞰のヒント) ----------
  function renderHints() {
    const isolated = state.raw.people.filter(p => {
      if (p.sk3所属 !== 'あり') return false;
      const hasRel = state.raw.relations.some(r => r.人ID === p.ID);
      return !hasRel;
    });
    const openProjects = state.raw.projects.filter(p => p.オープン === 'オープン').length;
    const openThemes = state.raw.themes.filter(t => t.状態 === '募集中').length;

    const lines = [];
    if (isolated.length) {
      lines.push(`<div class="hint"><strong>つなぎ候補:</strong> sk3 所属だが、まだどのプロジェクト/テーマにも紐づいていない人が ${isolated.length} 名(${isolated.slice(0, 3).map(p => p.表示名).join(', ')}${isolated.length > 3 ? ' ほか' : ''})。</div>`);
    }
    if (openProjects) lines.push(`<div class="hint">オープンなプロジェクト: ${openProjects} 件</div>`);
    if (openThemes) lines.push(`<div class="hint">募集中のテーマ: ${openThemes} 件</div>`);
    document.getElementById('hints').innerHTML = lines.join('') || '<div class="hint">気になる兆しは特になし。</div>';
  }

  // ---------- ユーティリティ ----------
  function setStatus(msg, isError) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
