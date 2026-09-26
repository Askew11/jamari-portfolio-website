(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var THINK_MS = reduceMotion ? 120 : 650;       // pause while the "model" picks its next tool
    var TOOL_MS = reduceMotion ? 80 : 450;         // pause while a tool runs

    var $ = function (sel) { return document.querySelector(sel); };

    var byId = {};
    INCIDENTS.forEach(function (inc, i) { inc.order = i; byId[inc.id] = inc; });

    var state;             // id -> { status: pending|processing|done, steps: [], result, triagedAt }
    var selected = INCIDENTS[0].id;
    var generation = 0;    // bumped by Reset so runs in flight stop
    var batchRunning = false;
    var follow = false;    // during "Triage all", keep the detail pane on whichever incident is running
    var openDetails = {};  // which "tool call" disclosures are open, so re-renders keep them open
    var shown = {};        // steps and results already on screen, so only new ones animate in
    var runs = 0;

    function fresh() {
        state = {};
        INCIDENTS.forEach(function (inc) { state[inc.id] = { status: 'pending', steps: [], result: null }; });
    }

    /* ---------------- The same checks as app/services/rules_service.py ---------------- */

    function ruleGaps(inc) {
        var gaps = [];
        if (!inc.assigned_to) gaps.push('No assignee – incident is unowned');
        if (!inc.priority) gaps.push('No priority set');
        if (!inc.description || inc.description.trim().length < 20) gaps.push('Description is too vague or missing');
        if (inc.created_at) {
            var age = Math.floor((Date.now() - new Date(inc.created_at).getTime()) / 86400000);
            if (age > 7 && inc.status !== 'Resolved') gaps.push('Incident has been open for ' + age + ' days without resolution');
        }
        return gaps;
    }

    // lookup_similar_incidents: already-triaged incidents in the same category, newest first.
    function similar(category, id) {
        return INCIDENTS
            .filter(function (inc) { var s = state[inc.id]; return inc.id !== id && s.status === 'done' && s.result.category === category; })
            .sort(function (a, b) { return state[b.id].triagedAt - state[a.id].triagedAt; })
            .slice(0, 5)
            .map(function (inc) {
                var r = state[inc.id].result;
                return { title: inc.title, summary: r.summary, urgency_score: r.urgency_score };
            });
    }

    function toolCall(name, inc) {
        var run = inc.run;
        switch (name) {
            case 'classify_incident':
                return { args: {}, result: { category: run.category } };
            case 'score_urgency':
                return { args: { category: run.category }, result: { urgency_score: run.urgency_score, summary: run.summary } };
            case 'lookup_similar_incidents':
                return { args: { category: run.category }, result: { similar_incidents: similar(run.category, inc.id) } };
            case 'recommend_actions':
                return { args: { category: run.category, urgency_score: run.urgency_score }, result: { next_actions: run.next_actions } };
        }
    }

    /* ---------------- Running a triage ---------------- */

    function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

    function triage(id) {
        var gen = generation;
        var inc = byId[id];
        var s = state[id] = { status: 'processing', steps: [], result: null, run: ++runs };
        var gaps = ruleGaps(inc);
        var live = function () { return gen === generation; };

        s.steps.push({ kind: 'rules', gaps: gaps });
        render();

        var chain = Promise.resolve();
        inc.run.order.forEach(function (name) {
            chain = chain.then(function () { return live() && wait(THINK_MS); })
                .then(function () { if (!live()) return; s.thinking = name; render(); return wait(TOOL_MS); })
                .then(function () {
                    if (!live()) return;
                    var call = toolCall(name, inc);
                    s.thinking = null;
                    s.steps.push({ kind: 'tool', tool: name, args: call.args, result: call.result });
                    render();
                });
        });
        return chain
            .then(function () { return live() && wait(THINK_MS); })
            .then(function () {
                if (!live()) return;
                var run = inc.run;
                s.steps.push({ kind: 'tool', tool: 'finalize_triage', args: {
                    summary: run.summary, category: run.category, urgency_score: run.urgency_score,
                    next_actions: run.next_actions, process_gaps: run.process_gaps
                } });
                s.result = {
                    summary: run.summary, category: run.category, urgency_score: run.urgency_score,
                    next_actions: run.next_actions, ai_gaps: run.process_gaps, rule_gaps: gaps
                };
                s.status = 'done';
                s.triagedAt = Date.now();
                render();
            });
    }

    function triageAll() {
        if (batchRunning) return;
        var gen = generation;
        var todo = sorted().filter(function (inc) { return state[inc.id].status === 'pending'; });
        if (!todo.length) return;
        batchRunning = true;
        follow = true;
        render();
        var chain = Promise.resolve();
        todo.forEach(function (inc) {
            chain = chain.then(function () {
                if (gen !== generation || state[inc.id].status !== 'pending') return;
                if (follow) selected = inc.id;
                return triage(inc.id);
            });
        });
        chain.then(function () {
            if (gen !== generation) return;
            batchRunning = false;
            follow = false;
            render();
        });
    }

    function reset() {
        generation++;
        batchRunning = false;
        follow = false;
        openDetails = {};
        fresh();
        selected = INCIDENTS[0].id;
        $('#fCategory').value = '';
        $('#fUrgency').value = '';
        render();
    }

    /* ---------------- Rendering ---------------- */

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function level(score) { return score >= 8 ? 'high' : score >= 5 ? 'mid' : 'low'; }
    function levelName(score) { return score >= 8 ? 'Critical' : score >= 5 ? 'Elevated' : 'Routine'; }
    function fmt(score) { return score.toFixed(1); }

    // Triaged incidents first, most urgent at the top (like GET /incidents), then the rest in upload order.
    function sorted() {
        return INCIDENTS.slice().sort(function (a, b) {
            var ra = state[a.id].result, rb = state[b.id].result;
            if (ra && rb) return rb.urgency_score - ra.urgency_score;
            if (ra) return -1;
            if (rb) return 1;
            return a.order - b.order;
        });
    }

    function visible() {
        var cat = $('#fCategory').value;
        var min = parseFloat($('#fUrgency').value);
        return sorted().filter(function (inc) {
            var r = state[inc.id].result;
            if (cat && (!r || r.category !== cat)) return false;
            if (!isNaN(min) && (!r || r.urgency_score < min)) return false;
            return true;
        });
    }

    function renderQueue() {
        var list = $('#queue');
        var items = visible();
        list.textContent = '';
        items.forEach(function (inc) {
            var s = state[inc.id];
            var li = el('li');
            var btn = el('button', 'item' + (inc.id === selected ? ' selected' : ''));
            btn.type = 'button';
            btn.dataset.id = inc.id;
            if (inc.id === selected) btn.setAttribute('aria-current', 'true');

            var badge = el('span', 'score');
            if (s.result) {
                badge.classList.add(level(s.result.urgency_score));
                badge.textContent = fmt(s.result.urgency_score);
                badge.setAttribute('aria-label', 'Urgency ' + fmt(s.result.urgency_score) + ' out of 10');
            } else {
                badge.classList.add(s.status === 'processing' ? 'busy' : 'none');
                badge.textContent = s.status === 'processing' ? '' : '–';
                badge.setAttribute('aria-label', s.status === 'processing' ? 'Triaging' : 'Not triaged yet');
            }
            btn.appendChild(badge);

            var body = el('span', 'item-body');
            body.appendChild(el('span', 'item-title', inc.title));
            var meta = el('span', 'item-meta', inc.id + ' · ' + inc.system);
            body.appendChild(meta);
            btn.appendChild(body);

            if (s.result) btn.appendChild(el('span', 'chip', CATEGORIES[s.result.category]));
            else if (s.status === 'processing') btn.appendChild(el('span', 'chip busy', 'Triaging…'));
            else btn.appendChild(el('span', 'chip muted', 'Pending'));

            li.appendChild(btn);
            list.appendChild(li);
        });
        $('#empty').hidden = items.length > 0;
    }

    function renderStats() {
        var done = INCIDENTS.filter(function (inc) { return state[inc.id].status === 'done'; });
        $('#sTotal').textContent = INCIDENTS.length;
        $('#sDone').textContent = done.length;
        $('#sUrgent').textContent = done.length ? done.filter(function (inc) { return state[inc.id].result.urgency_score >= 7; }).length : '—';
        $('#sGaps').textContent = done.length ? done.reduce(function (n, inc) {
            var r = state[inc.id].result;
            return n + r.ai_gaps.length + r.rule_gaps.length;
        }, 0) : '—';

        var all = $('#triageAll');
        var pending = INCIDENTS.some(function (inc) { return state[inc.id].status === 'pending'; });
        all.disabled = batchRunning || !pending;
        all.textContent = batchRunning ? 'Triaging…' : pending ? 'Triage all incidents' : 'All incidents triaged';
    }

    var TOOL_TEXT = {
        classify_incident: 'Classified the incident',
        score_urgency: 'Scored the urgency',
        lookup_similar_incidents: 'Checked past incidents',
        recommend_actions: 'Recommended next steps',
        finalize_triage: 'Finished and saved the triage'
    };
    var THINK_TEXT = {
        classify_incident: 'Classifying the incident',
        score_urgency: 'Scoring the urgency',
        lookup_similar_incidents: 'Looking up similar past incidents',
        recommend_actions: 'Working out next steps'
    };

    function stepOutcome(step) {
        var r = step.result;
        switch (step.tool) {
            case 'classify_incident': return 'Category: ' + CATEGORIES[r.category];
            case 'score_urgency': return fmt(r.urgency_score) + ' out of 10 (' + levelName(r.urgency_score) + ')';
            case 'lookup_similar_incidents':
                var found = r.similar_incidents;
                if (!found.length) return 'No past ' + CATEGORIES[step.args.category].toLowerCase() + ' incidents yet';
                return 'Found ' + found.length + ' similar: ' + found.map(function (f) { return '“' + f.title + '”'; }).join(', ');
            case 'recommend_actions': return r.next_actions.length + ' actions';
            case 'finalize_triage': return 'Stored in the database';
        }
    }

    // True the first time something is drawn, so it animates in once rather than on every re-render.
    function entering(key) {
        if (shown[key]) return false;
        shown[key] = true;
        return true;
    }

    function field(dl, label, value, warn) {
        var div = el('div');
        div.appendChild(el('dt', null, label));
        var dd = el('dd', warn ? 'warn' : null, value);
        div.appendChild(dd);
        dl.appendChild(div);
    }

    function renderDetail() {
        var inc = byId[selected];
        var s = state[inc.id];
        var pane = $('#detail');
        pane.textContent = '';

        var head = el('div', 'detail-head');
        var titles = el('div');
        titles.appendChild(el('p', 'eyebrow', inc.id + ' · ' + inc.system));
        titles.appendChild(el('h2', null, inc.title));
        head.appendChild(titles);
        var run = el('button', 'primary run', s.status === 'done' ? 'Re-triage' : s.status === 'processing' ? 'Triaging…' : 'Run triage');
        run.type = 'button';
        run.id = 'runOne';
        run.disabled = s.status === 'processing' || batchRunning;
        head.appendChild(run);
        pane.appendChild(head);

        pane.appendChild(el('p', 'desc', inc.description));

        var dl = el('dl', 'fields');
        field(dl, 'Reported by', inc.reported_by);
        field(dl, 'Assigned to', inc.assigned_to || 'Unassigned', !inc.assigned_to);
        field(dl, 'Priority', inc.priority || 'Not set', !inc.priority);
        field(dl, 'Status', inc.status);
        pane.appendChild(dl);

        if (s.result) pane.appendChild(renderResult(s.result, entering(s.run + ':result')));

        if (s.steps.length || s.status === 'processing') {
            pane.appendChild(el('h3', null, 'How the agent worked it'));
            var ol = el('ol', 'timeline');
            s.steps.forEach(function (step, i) { ol.appendChild(renderStep(inc, step, i, entering(s.run + ':' + i))); });
            if (s.status === 'processing') {
                var li = el('li', 'step thinking');
                li.appendChild(el('span', 'dot'));
                var text = el('div', 'step-body');
                text.appendChild(el('p', 'step-title', s.thinking ? THINK_TEXT[s.thinking] + '…' : 'Deciding what to do next…'));
                li.appendChild(text);
                ol.appendChild(li);
            }
            pane.appendChild(ol);
        } else {
            var hint = el('div', 'hint');
            hint.appendChild(el('p', null, 'Not triaged yet. Press Run triage to watch the agent work: it picks its own tools, in its own order, until it has enough to finish.'));
            pane.appendChild(hint);
        }

        if (s.result) {
            var api = el('details', 'api');
            api.dataset.key = inc.id + ':api';
            if (openDetails[api.dataset.key]) api.open = true;
            api.appendChild(el('summary', null, 'See the API response'));
            api.appendChild(el('pre', null, JSON.stringify(apiResponse(inc, s), null, 2)));
            pane.appendChild(api);
        }
    }

    function renderResult(r, enter) {
        var box = el('section', 'result ' + level(r.urgency_score) + (enter ? ' enter' : ''));

        var meter = el('div', 'meter-row');
        var big = el('p', 'big-score');
        big.appendChild(el('strong', null, fmt(r.urgency_score)));
        big.appendChild(el('span', null, '/10'));
        meter.appendChild(big);
        var info = el('div', 'meter-info');
        var labels = el('p', 'meter-label');
        labels.appendChild(el('span', 'level', levelName(r.urgency_score) + ' urgency'));
        labels.appendChild(el('span', 'chip', CATEGORIES[r.category]));
        info.appendChild(labels);
        var bar = el('div', 'meter');
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', 'Urgency ' + fmt(r.urgency_score) + ' out of 10');
        var fill = el('span');
        fill.style.width = (r.urgency_score * 10) + '%';
        bar.appendChild(fill);
        info.appendChild(bar);
        meter.appendChild(info);
        box.appendChild(meter);

        box.appendChild(el('h3', null, 'Summary'));
        box.appendChild(el('p', null, r.summary));

        box.appendChild(el('h3', null, 'Next actions'));
        var actions = el('ol', 'actions');
        r.next_actions.forEach(function (a) { actions.appendChild(el('li', null, a)); });
        box.appendChild(actions);

        box.appendChild(el('h3', null, 'Process gaps'));
        var gaps = r.rule_gaps.map(function (g) { return [g, 'Rule check']; })
            .concat(r.ai_gaps.map(function (g) { return [g, 'AI']; }));
        if (!gaps.length) box.appendChild(el('p', 'muted', 'None found.'));
        else {
            var ul = el('ul', 'gaps');
            gaps.forEach(function (g) {
                var li = el('li');
                li.appendChild(el('span', 'src ' + (g[1] === 'AI' ? 'ai' : 'rule'), g[1]));
                li.appendChild(document.createTextNode(g[0]));
                ul.appendChild(li);
            });
            box.appendChild(ul);
        }
        return box;
    }

    function renderStep(inc, step, i, enter) {
        var li = el('li', 'step ' + (step.kind === 'rules' ? 'rules' : 'tool') + (enter ? ' enter' : ''));
        li.appendChild(el('span', 'dot'));
        var body = el('div', 'step-body');
        if (step.kind === 'rules') {
            body.appendChild(el('p', 'step-title', 'Ran the rule checks'));
            body.appendChild(el('p', 'step-out', step.gaps.length
                ? step.gaps.length + (step.gaps.length === 1 ? ' gap' : ' gaps') + ' flagged before the AI starts'
                : 'Nothing flagged'));
        } else {
            var title = el('p', 'step-title');
            title.appendChild(el('span', 'step-num', 'Step ' + i));
            title.appendChild(document.createTextNode(TOOL_TEXT[step.tool]));
            body.appendChild(title);
            body.appendChild(el('p', 'step-out', stepOutcome(step)));

            var d = el('details', 'call');
            d.dataset.key = inc.id + ':' + i;
            if (openDetails[d.dataset.key]) d.open = true;
            d.appendChild(el('summary', null, 'Tool call'));
            var payload = { tool: step.tool, arguments: step.args };
            if (step.result) payload.result = step.result;
            d.appendChild(el('pre', null, JSON.stringify(payload, null, 2)));
            body.appendChild(d);
        }
        li.appendChild(body);
        return li;
    }

    // Shaped like the service's IncidentResponse from GET /api/v1/incidents/{id}.
    function apiResponse(inc, s) {
        var r = s.result;
        return {
            id: inc.id, title: inc.title, description: inc.description,
            reported_by: inc.reported_by, assigned_to: inc.assigned_to, status: inc.status,
            priority: inc.priority, system: inc.system, tags: inc.tags,
            summary: r.summary, category: r.category, urgency_score: r.urgency_score,
            next_actions: r.next_actions, process_gaps: r.ai_gaps.concat(r.rule_gaps),
            triage_status: 'done', triaged_at: new Date(s.triagedAt).toISOString().slice(0, 19)
        };
    }

    function render() {
        renderQueue();
        renderStats();
        renderDetail();
    }

    /* ---------------- Wiring ---------------- */

    $('#queue').addEventListener('click', function (e) {
        var btn = e.target.closest('.item');
        if (!btn) return;
        selected = btn.dataset.id;
        follow = false;
        render();
        if (window.matchMedia('(max-width: 760px)').matches) $('#detail').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });

    $('#detail').addEventListener('click', function (e) {
        if (e.target.id !== 'runOne' || batchRunning) return;
        if (state[selected].status !== 'processing') triage(selected);
    });

    $('#detail').addEventListener('toggle', function (e) {
        if (e.target.dataset && e.target.dataset.key) openDetails[e.target.dataset.key] = e.target.open;
    }, true);

    $('#triageAll').addEventListener('click', triageAll);
    $('#reset').addEventListener('click', reset);
    $('#fCategory').addEventListener('change', render);
    $('#fUrgency').addEventListener('change', render);

    var used = {};
    INCIDENTS.forEach(function (inc) { used[inc.run.category] = true; });
    Object.keys(CATEGORIES).forEach(function (key) {
        if (!used[key]) return;
        var opt = el('option', null, CATEGORIES[key]);
        opt.value = key;
        $('#fCategory').appendChild(opt);
    });

    fresh();
    render();
})();
