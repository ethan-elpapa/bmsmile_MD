"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MemberPanel from "./MemberPanel";
import MonthPanel from "./MonthPanel";
import ProjectPanel, { ANY_BRAND, NO_BRAND } from "./ProjectPanel";
import TeamPanel, { ALL, NOBODY } from "./TeamPanel";
import WeekPanel from "./WeekPanel";
import { carryMonth, freshMonth, metricsForCell } from "@/lib/seed";
import {
  type BoardState,
  EMPTY_FEED,
  type Feed,
  MARKETS,
  type Metric,
  monthKey,
  BRANDS,
  type Project,
  shiftMonth,
  type Status,
  STATUSES,
  type Task,
  type Week,
  type WeekItem,
  weekDate,
  weekIdOf,
  weekIsEmpty,
} from "@/lib/types";
import { newId, stamp, todayStr } from "@/lib/util";

const KEY_STORAGE = "kpi-board.key";
const POLL_MS = 20_000;

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict" | "readonly";

const SAVE_TEXT: Record<SaveState, string> = {
  idle: "변경하면 저장됩니다",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패",
  conflict: "다른 사람이 먼저 저장했습니다",
  readonly: "보기 전용",
};

const nextStatus = (s: Status): Status => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];

/**
 * 주 한 줄을 고쳐 넣는다. 없으면 만들고, 고친 뒤에 아무것도 안 남으면 뺀다 —
 * 아무도 안 쓴 주가 열두 줄씩 쌓이지 않게. 화면은 달력에서 빈 줄을 그리므로 사라져도 보인다.
 */
function putWeek(s: BoardState, weekId: string, fn: (cur: Week) => Week): BoardState {
  const cur = s.weeks.find((w) => w.id === weekId) ?? { id: weekId, items: [] };
  const next = fn(cur);
  const rest = s.weeks.filter((w) => w.id !== weekId);
  return { ...s, weeks: weekIsEmpty(next) ? rest : [...rest, next] };
}

export default function Board({
  initial,
  initialFeed,
  feedMonth,
  feedLinked,
  keyRequired,
  ephemeralStore,
  build,
}: {
  initial: BoardState;
  /** 서버가 미리 읽어 온 `feedMonth` 한 달치 */
  initialFeed: Feed;
  feedMonth: string;
  /** 시트가 붙어 있는 "us.mumuki" 들 */
  feedLinked: string[];
  keyRequired: boolean;
  ephemeralStore: boolean;
  build: string;
}) {
  const [state, setState] = useState<BoardState>(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [writeKey, setWriteKey] = useState<string | null>(null);
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [server, setServer] = useState<BoardState | null>(null);

  /**
   * 오늘 날짜는 마운트 뒤에 넣는다. 서버는 UTC, 브라우저는 KST 라 렌더 중에 읽으면
   * 지연 표시가 서버·브라우저에서 갈린다. 빈 문자열인 동안에는 아무것도 지연으로 보지 않는다.
   */
  const [today, setToday] = useState("");

  // 처음 그릴 때는 저장된 달 중 가장 최근 것 — 서버와 브라우저가 같은 값을 보게.
  const [month, setMonth] = useState(() => Object.keys(initial.months).sort().reverse()[0]);
  const [brand, setBrand] = useState(BRANDS[0].id);
  const [market, setMarket] = useState(MARKETS[0].id);
  const [editMetrics, setEditMetrics] = useState(false);
  const [filterMember, setFilterMember] = useState(ALL);
  const [filterProject, setFilterProject] = useState("");
  const [filterProjectBrand, setFilterProjectBrand] = useState(ANY_BRAND);
  const [filterWeek, setFilterWeek] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [pin, setPin] = useState("");

  /*
   * 시트에서 온 실적. 어느 달치인지를 값과 같이 들고 다닌다 —
   * 달을 바꿨는데 이전 달 숫자가 잠깐 남아 있으면 그게 제일 나쁜 화면이다.
   */
  const [fed, setFed] = useState<{ month: string; feed: Feed }>({ month: feedMonth, feed: initialFeed });

  const stateRef = useRef(state);
  stateRef.current = state;
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 저장이 날아가 있는 동안에는 두 번째 저장을 띄우지 않는다. rev 는 응답이 와야 오르는데,
   * 그 전에 또 보내면 낡은 rev 로 가서 **자기가 자기한테 409** 를 받는다.
   * 화면에는 "다른 사람이 먼저 저장했습니다" 가 뜨고, 그런 사람은 없다.
   */
  const inflight = useRef(false);
  const pending = useRef(false);
  const commitRef = useRef<() => void>(() => {});

  // 편집 키는 이 브라우저에만 남는다. 서버는 헤더로 받은 값만 본다.
  useEffect(() => {
    try {
      setWriteKey(localStorage.getItem(KEY_STORAGE));
    } catch {
      /* 시크릿 창 등 저장소가 막힌 경우 */
    }
    setKeyLoaded(true);
    const t = todayStr();
    setToday(t);
    // 보드는 늘 이번 달로 열린다. 그 달 목표가 아직 없으면 만들라고 화면이 묻는다.
    setMonth(monthKey(new Date()));
  }, []);

  const readOnly = keyRequired && !writeKey;

  useEffect(() => {
    if (readOnly && keyLoaded) setSave("readonly");
  }, [readOnly, keyLoaded]);

  const commit = useCallback(async () => {
    if (inflight.current) {
      pending.current = true;
      return;
    }
    inflight.current = true;
    const snapshot = stateRef.current;
    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(writeKey ? { "x-board-key": writeKey } : {}),
        },
        body: JSON.stringify({ rev: snapshot.rev, state: snapshot }),
      });

      if (res.status === 409) {
        const body = (await res.json()) as { state: BoardState };
        setServer(body.state);
        setSave("conflict");
        // 낡은 rev 로 다시 보내 봐야 또 409 다. 사람이 결정할 때까지 멈춘다.
        pending.current = false;
        return;
      }
      if (res.status === 401) {
        pending.current = false;
        try {
          localStorage.removeItem(KEY_STORAGE);
        } catch {
          /* 무시 */
        }
        setWriteKey(null);
        setSave("readonly");
        return;
      }
      if (!res.ok) {
        setSave("error");
        return;
      }

      const body = (await res.json()) as { state: BoardState };
      // 응답을 통째로 덮어쓰면 저장 중에 입력한 글자가 사라진다. 번호만 받아 온다.
      setState((s) => ({ ...s, rev: body.state.rev, updated: body.state.updated }));
      // 기다리는 변경이 남아 있으면 아직 깨끗한 게 아니다 — 여기서 풀면 폴링이 덮어쓴다.
      if (!pending.current) {
        dirty.current = false;
        setSave("saved");
      }
    } catch {
      setSave("error");
    } finally {
      inflight.current = false;
      if (pending.current) {
        pending.current = false;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commitRef.current(), 250);
      }
    }
  }, [writeKey]);
  commitRef.current = commit;

  const queueSave = useCallback(
    (delay = 700) => {
      if (readOnly) return;
      dirty.current = true;
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(commit, delay);
    },
    [commit, readOnly],
  );

  // 다른 사람이 바꾼 걸 가져온다. 내 쪽에 저장 안 된 변경이 있으면 건드리지 않는다.
  useEffect(() => {
    const tick = async () => {
      if (dirty.current || document.hidden) return;
      try {
        const res = await fetch("/api/board", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { state: BoardState };
        if (body.state.rev !== stateRef.current.rev) setState(body.state);
      } catch {
        /* 잠깐 끊긴 것뿐이면 다음 차례에 다시 본다 */
      }
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // 보고 있는 달이 바뀌면 그 달 실적을 가져온다. 오는 동안에는 저장된 값으로 보인다.
  useEffect(() => {
    if (fed.month === month) return;
    let dropped = false;
    setFed({ month, feed: EMPTY_FEED });
    (async () => {
      try {
        const res = await fetch(`/api/feed?month=${month}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { feed: Feed };
        if (!dropped) setFed({ month, feed: body.feed });
      } catch {
        /* 시트를 못 읽으면 그 달은 손으로 넣은 값만 보인다 */
      }
    })();
    return () => {
      dropped = true;
    };
  }, [month, fed.month]);

  // 달을 넘기면 좁혀 보던 주는 푼다 — 지난 달의 주로 걸러진 빈 표가 남지 않게.
  useEffect(() => {
    setFilterWeek("");
  }, [month]);

  const mutate = (fn: (s: BoardState) => BoardState, delay?: number) => {
    setState(fn);
    queueSave(delay);
  };

  /* ---------- 월 목표 ---------- */

  const createMonth = (carry: boolean) => {
    const prev = state.months[shiftMonth(month, -1)];
    const made = carry && prev ? carryMonth(prev, newId) : freshMonth();
    mutate((s) => ({ ...s, months: { ...s.months, [month]: made } }), 300);
  };

  /** 브랜드 × 마켓 칸이 그 달에 비어 있을 때. 채널마다 기본 다섯 칸을 깔아 준다. */
  const seedCell = () =>
    mutate((s) => {
      const m = s.months[month];
      if (!m) return s;
      // 이미 있는 줄은 건드리지 않는다 — 다른 마켓 지표를 지우면 안 된다.
      const add = metricsForCell(brand, market).filter(
        (x) =>
          !m.metrics.some(
            (y) =>
              y.brand === brand && y.market === market && y.channel === x.channel && y.name === x.name,
          ),
      );
      return { ...s, months: { ...s.months, [month]: { ...m, metrics: [...m.metrics, ...add] } } };
    }, 400);

  const patchMetric = (id: string, patch: Partial<Metric>) =>
    mutate((s) => {
      const m = s.months[month];
      if (!m) return s;
      return {
        ...s,
        months: {
          ...s.months,
          [month]: { ...m, metrics: m.metrics.map((x) => (x.id === id ? { ...x, ...patch } : x)) },
        },
      };
    });

  /** 채널 줄 끝의 ＋ 로 들어온다. 어느 줄에서 눌렀는지가 channel 이다. */
  const addMetric = (channel: string) =>
    mutate(
      (s) => {
        const m = s.months[month] ?? freshMonth();
        return {
          ...s,
          months: {
            ...s.months,
            [month]: {
              ...m,
              metrics: [
                ...m.metrics,
                // 화면에서 만든 지표는 시트에 붙지 않는다(`src` 없음) — 손으로 넣는 칸이다.
                {
                  id: newId(),
                  name: "새 지표",
                  unit: "usd",
                  target: 0,
                  actual: 0,
                  brand,
                  market,
                  channel,
                  lower: false,
                  basisKey: "",
                  basisName: "",
                  src: "",
                },
              ],
            },
          },
        };
      },
      1200,
    );

  const removeMetric = (id: string) => {
    const m = state.months[month];
    const found = m?.metrics.find((x) => x.id === id);
    if (found && (found.target || found.actual) && !window.confirm(`"${found.name}" 지표를 이 달에서 지웁니다.`)) return;
    mutate((s) => {
      const cur = s.months[month];
      if (!cur) return s;
      return {
        ...s,
        months: { ...s.months, [month]: { ...cur, metrics: cur.metrics.filter((x) => x.id !== id) } },
      };
    }, 300);
  };

  /* ---------- 프로젝트 ---------- */

  /**
   * 브랜드로 좁혀 본 상태에서 만들면 **그 브랜드로 태그해서** 만든다.
   * 안 그러면 방금 만든 줄이 필터에 걸려 화면에 없고, 버튼이 안 먹는 것처럼 보인다.
   * (업무 표에서 담당자·프로젝트를 물려주는 것과 같은 규칙이다.)
   */
  const addProject = () =>
    mutate(
      (s) => ({
        ...s,
        projects: [
          ...s.projects,
          {
            id: newId(),
            name: "새 프로젝트",
            goal: "",
            owner: "",
            due: "",
            status: 0 as Status,
            brands:
              filterProjectBrand && filterProjectBrand !== NO_BRAND ? [filterProjectBrand] : [],
          },
        ],
      }),
      1200,
    );

  const patchProject = (id: string, patch: Partial<Project>) =>
    mutate((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const cycleProject = (id: string) =>
    mutate(
      (s) => ({
        ...s,
        projects: s.projects.map((p) => (p.id === id ? { ...p, status: nextStatus(p.status) } : p)),
      }),
      400,
    );

  const removeProject = (id: string) => {
    if (filterProject === id) setFilterProject("");
    mutate((s) => ({
      ...s,
      projects: s.projects.filter((p) => p.id !== id),
      tasks: s.tasks.map((t) => (t.project === id ? { ...t, project: "" } : t)),
    }), 300);
  };

  /* ---------- 주간 ---------- */

  /**
   * 빈 주는 저장에 없다. 처음 한 줄이 생길 때 주도 생긴다 —
   * 아무도 안 쓴 주가 열두 줄씩 쌓이는 걸 막는다.
   */
  const addWeekItem = (weekId: string, by: string) =>
    mutate(
      (s) =>
        putWeek(s, weekId, (cur) => ({
          ...cur,
          items: [...cur.items, { id: newId(), by, text: "", done: false, doneAt: "" }],
        })),
      1200,
    );

  /**
   * 항목 하나만 고친다. 주를 통째로 넘기면 그 사이 다른 사람이 적은 줄을 덮어쓴다.
   * 글을 다 지우면 줄까지 없어진다 — 빈 줄이 쌓이지 않게.
   */
  const patchWeekItem = (weekId: string, itemId: string, patch: Partial<WeekItem>) =>
    mutate((s) =>
      putWeek(s, weekId, (cur) => {
        const next = cur.items
          .map((x) => (x.id === itemId ? { ...x, ...patch } : x))
          .filter((x) => x.id !== itemId || x.text || x.done);
        return { ...cur, items: next };
      }),
    );

  const removeWeekItem = (weekId: string, itemId: string) =>
    mutate(
      (s) => putWeek(s, weekId, (cur) => ({ ...cur, items: cur.items.filter((x) => x.id !== itemId) })),
      300,
    );

  /* ---------- 업무 ---------- */

  /** 지금 좁혀 보고 있는 조건을 그대로 물려준다 — 김OO 로 필터해 두고 누르면 김OO 의 업무가 된다. */
  const addTask = () => {
    const id = newId();
    setPin(id);
    mutate(
      (s) => ({
        ...s,
        tasks: [
          ...s.tasks,
          {
            id,
            title: "",
            assignee: filterMember === NOBODY ? "" : filterMember,
            project: filterProject,
            // 주로 좁혀 본 상태면 그 주 안에 기한을 준다. 안 그러면 방금 만든 줄이
            // 기한 없는 업무로 필터에 걸려 화면에 안 보인다(프로젝트 브랜드와 같은 규칙).
            due: filterWeek ? (weekIdOf(today) === filterWeek ? today : weekDate(filterWeek, 4)) : "",
            status: 0 as Status,
            note: "",
            url: "",
            brands: [],
          },
        ],
      }),
      1500,
    );
  };

  const patchTask = (id: string, patch: Partial<Task>) =>
    mutate((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));

  const cycleTask = (id: string) =>
    mutate(
      (s) => ({
        ...s,
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: nextStatus(t.status) } : t)),
      }),
      400,
    );

  const removeTask = (id: string) =>
    mutate((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }), 300);

  /* ---------- 편집 키 ---------- */

  const askKey = () => {
    if (writeKey) {
      if (!window.confirm("편집을 잠그고 보기 전용으로 돌아갑니다.")) return;
      try {
        localStorage.removeItem(KEY_STORAGE);
      } catch {
        /* 무시 */
      }
      setWriteKey(null);
      setSave("readonly");
      return;
    }
    const v = window.prompt("편집 키를 입력하세요.");
    if (!v) return;
    try {
      localStorage.setItem(KEY_STORAGE, v);
    } catch {
      /* 저장이 막혀 있으면 이번 세션에만 유지된다 */
    }
    setWriteKey(v);
    setSave("idle");
  };

  const takeServer = () => {
    if (!server) return;
    setState(server);
    setServer(null);
    dirty.current = false;
    setSave("idle");
  };

  const cur = state.months[month];

  return (
    <div className={"wrap" + (readOnly ? " ro" : "")}>
      <header className="masthead">
        <div>
          <span className="eyebrow">Global online platform team · monthly &amp; project KPI</span>
          <h1>글로벌 온라인 플랫폼팀 KPI 보드</h1>
        </div>
        <div className="headright">
          {keyRequired ? (
            <button type="button" className="keybtn" onClick={askKey}>
              {writeKey ? "편집 잠그기" : "편집 잠금 해제"}
            </button>
          ) : null}
          <span className="savepill" data-s={save}>
            <i className="dot" />
            {SAVE_TEXT[save]}
          </span>
        </div>
      </header>

      {server ? (
        <p className="banner stop">
          <b>다른 사람이 먼저 저장했습니다</b> — 방금 바꾼 내용은 아직 반영되지 않았습니다. 저장된 내용을 불러온 뒤
          다시 고쳐 주세요.
          <button type="button" onClick={takeServer}>
            저장된 내용 불러오기
          </button>
        </p>
      ) : null}

      <MonthPanel
        monthId={month}
        month={cur}
        monthIds={Object.keys(state.months)}
        feed={fed.month === month ? fed.feed : EMPTY_FEED}
        feedLinked={feedLinked}
        brand={brand}
        market={market}
        today={today}
        readOnly={readOnly}
        editing={editMetrics}
        onToggleEdit={() => setEditMetrics((v) => !v)}
        onPick={setMonth}
        onStep={(n) => setMonth((m) => shiftMonth(m, n))}
        onPatch={patchMetric}
        onAdd={addMetric}
        onRemove={removeMetric}
        onCreate={createMonth}
        onPickBrand={setBrand}
        onPickMarket={setMarket}
        onSeedCell={seedCell}
        hasPrev={Boolean(state.months[shiftMonth(month, -1)])}
      />

      <ProjectPanel
        projects={state.projects}
        members={state.members}
        tasks={state.tasks}
        today={today}
        readOnly={readOnly}
        filter={filterProject}
        brandFilter={filterProjectBrand}
        onFilter={setFilterProject}
        onBrandFilter={setFilterProjectBrand}
        onPatch={patchProject}
        onCycle={cycleProject}
        onAdd={addProject}
        onRemove={removeProject}
      />

      <MemberPanel
        members={state.members}
        projects={state.projects}
        tasks={state.tasks}
        today={today}
        filter={filterMember}
        onFilter={setFilterMember}
      />

      <WeekPanel
        monthId={month}
        weeks={state.weeks}
        members={state.members}
        tasks={state.tasks}
        today={today}
        readOnly={readOnly}
        filter={filterWeek}
        filterMember={filterMember}
        onFilter={setFilterWeek}
        onFilterMember={setFilterMember}
        onAddItem={addWeekItem}
        onPatchItem={patchWeekItem}
        onRemoveItem={removeWeekItem}
      />

      <TeamPanel
        members={state.members}
        projects={state.projects}
        tasks={state.tasks}
        today={today}
        readOnly={readOnly}
        filterMember={filterMember}
        filterProject={filterProject}
        filterWeek={filterWeek}
        showDone={showDone}
        pin={pin}
        onFilterMember={setFilterMember}
        onFilterProject={setFilterProject}
        onFilterWeek={setFilterWeek}
        onToggleDone={() => setShowDone((v) => !v)}
        onTaskPatch={patchTask}
        onTaskCycle={cycleTask}
        onTaskAdd={addTask}
        onTaskRemove={removeTask}
      />

      <footer>
        <span>{stamp(state.updated)}</span>
        <span>
          <code>
            {ephemeralStore ? "저장소 미연결 · " : ""}
            {keyRequired ? "" : "편집 키 없음 · "}
            상태 칸을 누르면 시작 전 → 진행 → 완료 로 돕니다 · build {build}
          </code>
        </span>
      </footer>
    </div>
  );
}
