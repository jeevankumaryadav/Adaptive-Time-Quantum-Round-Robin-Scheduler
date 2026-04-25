/* ============================================================
   Adaptive Round Robin Scheduler — script.js
   ============================================================ */

// ── Process colour palette (one per PID) ────────────────────
const PROC_COLORS = [
  '#7c6fff', '#5ddcff', '#ff6b9d', '#ffbe3d',
  '#4ade80', '#fb923c', '#c084fc', '#34d399'
];

// ── Which strategies are currently enabled ───────────────────
let activeStrategies = new Set(['standard', 'average', 'median']);

// ── Chart.js instance (destroyed & re-created on each run) ──
let compChart = null;


/* ============================================================
   INPUT PARSING
   ============================================================ */
function parseInput() {
  const text  = document.getElementById('inputData').value.trim();
  const lines = text.split('\n');
  const procs = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || isNaN(parseInt(line[0]))) continue;

    const parts = line.split(/\s+/).map(Number);
    if (parts.length < 3) continue;

    const [id, arrival, burst] = parts;
    if (isNaN(id) || isNaN(arrival) || isNaN(burst) || burst <= 0) continue;

    procs.push({
      id,
      arrival,
      burst,
      remaining:  burst,
      waiting:    0,
      turnaround: 0,
      response:   -1
    });
  }

  return procs;
}


/* ============================================================
   CORE ROUND ROBIN ALGORITHM
   Returns: { processes, gantt, quantum, avgWT, avgTAT, avgRT }
   ============================================================ */
function roundRobin(processes, quantum) {
  let time = 0, completed = 0;
  const queue   = [];
  const inQueue = new Array(processes.length).fill(false);
  const gantt   = [];                // [{pid, start, end}]

  // Sort by arrival time
  processes.sort((a, b) => a.arrival - b.arrival);

  // Enqueue processes that arrive at time 0
  for (let i = 0; i < processes.length; i++) {
    if (processes[i].arrival <= 0) {
      queue.push(i);
      inQueue[i] = true;
    }
  }

  while (completed < processes.length) {

    // ── CPU idle: jump to next arrival ──────────────────────
    if (queue.length === 0) {
      const pending = processes
        .filter((_, i) => !inQueue[i] && processes[i].remaining > 0)
        .map(p => p.arrival);

      if (pending.length === 0) break;           // nothing left
      const nextAt = Math.min(...pending);
      gantt.push({ pid: -1, start: time, end: nextAt });
      time = nextAt;

      for (let j = 0; j < processes.length; j++) {
        if (!inQueue[j] && processes[j].arrival <= time && processes[j].remaining > 0) {
          queue.push(j);
          inQueue[j] = true;
        }
      }
      continue;
    }

    // ── Dequeue next process ─────────────────────────────────
    const i = queue.shift();
    const p = processes[i];

    // Record first-response time
    if (p.response === -1) p.response = time - p.arrival;

    // Execute for min(quantum, remaining)
    const exec = Math.min(quantum, p.remaining);
    gantt.push({ pid: p.id, start: time, end: time + exec });
    p.remaining -= exec;
    time        += exec;

    // Enqueue newly-arrived processes
    for (let j = 0; j < processes.length; j++) {
      if (!inQueue[j] && processes[j].arrival <= time && processes[j].remaining > 0) {
        queue.push(j);
        inQueue[j] = true;
      }
    }

    // Preempt or complete
    if (p.remaining > 0) {
      queue.push(i);
    } else {
      completed++;
      p.turnaround = time - p.arrival;
      p.waiting    = p.turnaround - p.burst;
    }
  }

  // ── Aggregate metrics ────────────────────────────────────
  let wt = 0, tat = 0, rt = 0;
  processes.forEach(p => { wt += p.waiting; tat += p.turnaround; rt += p.response; });

  return {
    processes,
    gantt,
    quantum,
    avgWT:  +(wt  / processes.length).toFixed(2),
    avgTAT: +(tat / processes.length).toFixed(2),
    avgRT:  +(rt  / processes.length).toFixed(2)
  };
}


/* ============================================================
   RANDOM PROCESS GENERATOR
   ============================================================ */
function generateRandom() {
  const n     = Math.floor(Math.random() * 4) + 4;  // 4–7 processes
  const lines = [];
  let at = 0;

  for (let i = 1; i <= n; i++) {
    at += Math.floor(Math.random() * 3);
    const burst = Math.floor(Math.random() * 10) + 2;
    lines.push(`${i} ${at} ${burst}`);
  }

  document.getElementById('inputData').value = lines.join('\n');
}


/* ============================================================
   STRATEGY TOGGLE (pill buttons)
   ============================================================ */
function toggleStrategy(el) {
  const s = el.dataset.s;

  if (activeStrategies.has(s)) {
    if (activeStrategies.size === 1) return;   // keep at least one active
    activeStrategies.delete(s);
    el.classList.remove('active');
  } else {
    activeStrategies.add(s);
    el.classList.add('active');
  }
}


/* ============================================================
   MAIN ENTRY POINT — run all selected strategies
   ============================================================ */
function runScheduler() {
  const rawProcs = parseInput();
  if (rawProcs.length === 0) { alert('No valid processes found!'); return; }

  const quantum = Math.max(1, parseInt(document.getElementById('quantum').value) || 3);

  // ── Compute adaptive quanta ──────────────────────────────
  const bursts  = rawProcs.map(p => p.burst);
  const avgQ    = Math.max(1, Math.round(bursts.reduce((a, b) => a + b, 0) / bursts.length));
  const sortedB = [...bursts].sort((a, b) => a - b);
  const medQ    = Math.max(1, sortedB[Math.floor(sortedB.length / 2)]);

  // ── Build result set for each active strategy ────────────
  const allResults = [];

  if (activeStrategies.has('standard')) {
    allResults.push({
      name:   'Standard RR',
      key:    'standard',
      qLabel: `Q=${quantum}`,
      result: roundRobin(JSON.parse(JSON.stringify(rawProcs)), quantum)
    });
  }
  if (activeStrategies.has('average')) {
    allResults.push({
      name:   'Adaptive (Average)',
      key:    'average',
      qLabel: `Q=${avgQ}`,
      result: roundRobin(JSON.parse(JSON.stringify(rawProcs)), avgQ)
    });
  }
  if (activeStrategies.has('median')) {
    allResults.push({
      name:   'Adaptive (Median)',
      key:    'median',
      qLabel: `Q=${medQ}`,
      result: roundRobin(JSON.parse(JSON.stringify(rawProcs)), medQ)
    });
  }

  renderOutput(allResults, rawProcs);
}


/* ============================================================
   RENDER — top-level output orchestrator
   ============================================================ */
function renderOutput(allResults, rawProcs) {
  const out = document.getElementById('output-area');
  out.innerHTML = '';

  // ── Determine best / worst by avgWT ─────────────────────
  const wts      = allResults.map(r => r.result.avgWT);
  const bestIdx  = wts.indexOf(Math.min(...wts));
  const worstIdx = wts.indexOf(Math.max(...wts));

  // ── Winner banner ────────────────────────────────────────
  if (allResults.length > 1) {
    const w      = allResults[bestIdx];
    const banner = el('div', 'winner-banner');
    banner.innerHTML =
      `<span>🏆</span>
       <div><strong>${w.name}</strong> wins with lowest Avg Wait = <strong>${w.result.avgWT}</strong> (${w.qLabel})</div>`;
    out.appendChild(banner);
  }

  // ── Tab header (multi-strategy) ──────────────────────────
  const tabRow = el('div', 'tab-row');

  allResults.forEach((r, i) => {
    const t = el('div', 'tab' + (i === 0 ? ' active' : ''));
    t.textContent = r.name;
    t.onclick = () => {
      tabRow.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p, pi) => {
        p.style.display = pi === i ? 'block' : 'none';
      });
    };
    tabRow.appendChild(t);
  });

  if (allResults.length > 1) {
    const sec = el('div', 'results-section');
    const st  = el('div', 'section-title'); st.textContent = 'Per-Strategy Results';
    sec.appendChild(st);
    sec.appendChild(tabRow);
    out.appendChild(sec);
  }

  // ── Per-strategy panels ───────────────────────────────────
  allResults.forEach((r, i) => {
    const panel = el('div', 'tab-panel');
    panel.style.display = i === 0 ? 'block' : 'none';
    renderStrategyPanel(panel, r, rawProcs, i === bestIdx, i === worstIdx);
    out.appendChild(panel);
  });

  // ── Comparison chart (only when multiple strategies) ─────
  if (allResults.length > 1) {
    const sec  = el('div', 'results-section');
    const st   = el('div', 'section-title'); st.textContent = 'Metric Comparison';
    const card = el('div', 'card');
    const wrap = el('div', 'chart-wrap');
    const canvas = document.createElement('canvas');
    canvas.id = 'compChart';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Bar chart comparing Avg Wait Time, Avg Turnaround, and Avg Response Time across strategies');
    wrap.appendChild(canvas);
    card.appendChild(wrap);
    sec.appendChild(st);
    sec.appendChild(card);
    out.appendChild(sec);
    renderCompChart(allResults);
  }
}


/* ============================================================
   RENDER — one strategy panel (stats + gantt + table)
   ============================================================ */
function renderStrategyPanel(panel, r, rawProcs, isBest, isWorst) {
  // ── Stat cards ──────────────────────────────────────────
  const statsRow = el('div', 'stats-row');
  const metrics  = [
    { lbl: 'Avg Wait Time',   val: r.result.avgWT  },
    { lbl: 'Avg Turnaround',  val: r.result.avgTAT },
    { lbl: 'Avg Response',    val: r.result.avgRT  }
  ];

  metrics.forEach((m, i) => {
    let cls = 'stat-card';
    if (i === 0 && isBest)  cls += ' best';
    if (i === 0 && isWorst) cls += ' worst';

    const sc = el('div', cls);
    const sv = el('div', 'stat-val'); sv.textContent = m.val;
    const sl = el('div', 'stat-lbl'); sl.textContent = m.lbl + ' · ' + r.qLabel;
    sc.appendChild(sv);
    sc.appendChild(sl);
    statsRow.appendChild(sc);
  });
  panel.appendChild(statsRow);

  // ── Gantt section ───────────────────────────────────────
  const gSec  = el('div', 'results-section');
  const gSt   = el('div', 'section-title'); gSt.textContent = 'Gantt Chart';
  const gCard = el('div', 'card');
  const gWrap = el('div', 'gantt-wrap');
  renderGantt(gWrap, r.result.gantt, rawProcs);
  gCard.appendChild(gWrap);
  gSec.appendChild(gSt);
  gSec.appendChild(gCard);
  panel.appendChild(gSec);

  // ── Table section ───────────────────────────────────────
  const tSec  = el('div', 'results-section');
  const tSt   = el('div', 'section-title'); tSt.textContent = 'Process Metrics';
  const tCard = el('div', 'card');
  tCard.appendChild(buildTable(r.result.processes));
  tSec.appendChild(tSt);
  tSec.appendChild(tCard);
  panel.appendChild(tSec);
}


/* ============================================================
   GANTT CHART RENDERER
   ============================================================ */
function renderGantt(wrap, gantt, rawProcs) {
  if (!gantt || gantt.length === 0) { wrap.textContent = 'No data'; return; }

  const maxT = gantt[gantt.length - 1].end;
  const pids = [...new Set(rawProcs.map(p => p.id))];
  const container = el('div', 'gantt-container');

  pids.forEach((pid, pi) => {
    const color = PROC_COLORS[pi % PROC_COLORS.length];
    const row   = el('div', 'gantt-row');

    // ── Label column ─────────────────────────────────────
    const label = el('div', 'gantt-label');
    const dot   = document.createElement('span');
    dot.style.cssText =
      `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0`;
    const lt = document.createElement('span');
    lt.textContent = `P${pid}`;
    label.appendChild(dot);
    label.appendChild(lt);

    // ── Bar area ──────────────────────────────────────────
    const area = el('div', 'gantt-bar-area');
    gantt.filter(g => g.pid === pid).forEach(seg => {
      const leftPct  = (seg.start / maxT) * 100;
      const widthPct = ((seg.end - seg.start) / maxT) * 100;
      if (widthPct < 0.1) return;

      const bar = el('div', 'gantt-seg');
      bar.style.left       = leftPct + '%';
      bar.style.width      = widthPct + '%';
      bar.style.background = color;
      bar.style.opacity    = '0.88';
      bar.title            = `P${pid}: t=${seg.start}→${seg.end}`;
      if (widthPct > 5) bar.textContent = `${seg.start}-${seg.end}`;
      area.appendChild(bar);
    });

    row.appendChild(label);
    row.appendChild(area);
    container.appendChild(row);
  });

  // ── Tick axis ────────────────────────────────────────────
  const tickRow  = el('div', 'gantt-tick-row');
  const tickStep = Math.ceil(maxT / Math.min(maxT, 16));

  for (let t = 0; t <= maxT; t += tickStep) {
    const tick = el('div', 'gantt-tick');
    tick.style.left = (t / maxT * 100) + '%';
    tick.textContent = t;
    tickRow.appendChild(tick);
  }
  // Always show last tick
  const lastTick = el('div', 'gantt-tick');
  lastTick.style.left = '100%';
  lastTick.textContent = maxT;
  tickRow.appendChild(lastTick);

  container.appendChild(tickRow);
  wrap.appendChild(container);
}


/* ============================================================
   PROCESS TABLE BUILDER
   ============================================================ */
function buildTable(procs) {
  const table = el('table', 'proc-table');

  // ── Header ───────────────────────────────────────────────
  const thead = document.createElement('thead');
  const hr    = document.createElement('tr');
  ['PID', 'Arrival', 'Burst', 'Wait', 'Turnaround', 'Response'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  // ── Body ─────────────────────────────────────────────────
  const tbody = document.createElement('tbody');
  procs.forEach(p => {
    const tr   = document.createElement('tr');
    const vals = [p.id, p.arrival, p.burst, p.waiting, p.turnaround, p.response];
    const cls  = ['pid', '', '', '', '', ''];

    vals.forEach((v, i) => {
      const td = document.createElement('td');
      if (cls[i]) td.className = cls[i];
      td.textContent = v;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  return table;
}


/* ============================================================
   COMPARISON BAR CHART (Chart.js)
   ============================================================ */
function renderCompChart(allResults) {
  if (compChart) { compChart.destroy(); compChart = null; }

  const canvas = document.getElementById('compChart');
  if (!canvas) return;

  const chartColors = ['#7c6fff', '#5ddcff', '#ff6b9d'];

  compChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Avg Wait Time', 'Avg Turnaround', 'Avg Response Time'],
      datasets: allResults.map((r, i) => ({
        label:           r.name,
        data:            [r.result.avgWT, r.result.avgTAT, r.result.avgRT],
        backgroundColor: chartColors[i] + '55',
        borderColor:     chartColors[i],
        borderWidth:     1.5,
        borderRadius:    6
      }))
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: '#555a7a', font: { size: 11 } },
          grid:  { color: 'rgba(120,130,255,0.07)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#555a7a', font: { size: 11 } },
          grid:  { color: 'rgba(120,130,255,0.07)' }
        }
      }
    }
  });

  // ── Custom legend below chart ────────────────────────────
  const legendWrap = document.createElement('div');
  legendWrap.style.cssText =
    'display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px;';

  allResults.forEach((r, i) => {
    const item = document.createElement('span');
    item.style.cssText = 'display:flex;align-items:center;gap:5px;color:#8b90b8;';
    item.innerHTML =
      `<span style="width:10px;height:10px;border-radius:2px;
                    background:${chartColors[i]};display:inline-block"></span>
       ${r.name} (${r.qLabel})`;
    legendWrap.appendChild(item);
  });

  canvas.parentElement.parentElement.appendChild(legendWrap);
}


/* ============================================================
   UTILITY — createElement shorthand
   ============================================================ */
function el(tag, cls) {
  const e = document.createElement(tag || 'div');
  if (cls) e.className = cls;
  return e;
}