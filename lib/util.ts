import type { Feed, Metric, Status, Task, Unit } from "./types";

/**
 * 화면에 띄울 실적. 시트에 연결된 지표(`src`)면 시트 값이 이기고,
 * 그 달 값이 없으면 저장된 값으로 물러난다 — 연결됐다는 이유로 빈 칸이 되면 안 된다.
 */
export function actualOf(m: Pick<Metric, "src" | "actual">, feed: Feed): number {
  const v = m.src ? feed.values[m.src] : undefined;
  return v === undefined ? m.actual : v;
}

/** 이 지표가 지금 시트에서 오고 있는지. 칸을 잠그고 배지를 띄울지가 여기서 갈린다. */
export function isLive(m: Pick<Metric, "src">, feed: Feed): boolean {
  return Boolean(m.src) && feed.values[m.src] !== undefined;
}

/* ---------- 숫자 ---------- */

/**
 * 로케일을 명시해서 부른다. 붙이지 않으면 서버(UTC·en-US)와 브라우저(ko-KR)가
 * 다른 문자열을 만들어 하이드레이션이 어긋난다.
 */
export function fmt(n: number, unit: Unit): string {
  if (unit === "usd") return `$${Math.round(n).toLocaleString("en-US")}`;
  if (unit === "pct") return `${(Math.round(n * 10) / 10).toLocaleString("en-US")}%`;
  if (unit === "mult") return `${(Math.round(n * 10) / 10).toLocaleString("en-US")}배`;
  return n.toLocaleString("en-US");
}

/** 입력 칸에 넣을 값. 천 단위만 넣고 통화 기호는 빼 둔다 — 칸 안에서는 방해가 된다. */
export function fmtInput(n: number, unit: Unit): string {
  if (n === 0) return "";
  if (unit === "pct" || unit === "mult") return String(Math.round(n * 10) / 10);
  return Math.round(n).toLocaleString("en-US");
}

/** "12,000" · "$12000" · "12.5%" 를 다 받는다. 숫자로 못 읽으면 0. */
export function parseNum(s: string): number {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 달성률 0~. 목표가 0 이면 아직 세우지 않은 것으로 보고 null 을 준다. */
export function rate(actual: number, target: number): number | null {
  if (!target) return null;
  return actual / target;
}

/* ---------- 날짜 ---------- */

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 기한이 지났는데 아직 안 끝났으면 지연.
 * `today` 가 빈 문자열이면(=아직 마운트 전) 아무것도 지연으로 보지 않는다 —
 * 서버는 UTC, 브라우저는 KST 라 렌더가 갈리는 걸 막는다.
 */
export function isLate(due: string, status: Status, today: string) {
  return Boolean(due) && Boolean(today) && status !== 2 && due < today;
}

/** 이 달이 얼마나 지났는지 0~1. 오늘이 그 달이 아니면 null. */
export function monthPace(monthId: string, today: string): number | null {
  if (!today || !today.startsWith(monthId)) return null;
  const [y, m] = monthId.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return Number(today.slice(8, 10)) / days;
}

export function stamp(iso: string | null) {
  if (!iso) return "아직 저장된 변경 없음";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "아직 저장된 변경 없음";
  const p = (n: number) => String(n).padStart(2, "0");
  return `마지막 변경 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 링크 칸에 적힌 주소를 열 수 있는 모양으로. 스킴을 안 적는 사람이 더 많아서 https:// 를 붙인다.
 * 스킴 검사는 저장할 때 이미 했다(`lib/seed.ts` 의 `link`) — 여기 오는 값은 http(s) 아니면 스킴이 없다.
 */
export function href(url: string): string {
  const s = url.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
}

/** "9/17" — 표에서 기한은 짧게 읽히는 게 낫다. */
export function shortDate(due: string) {
  if (!due) return "";
  return `${Number(due.slice(5, 7))}/${Number(due.slice(8, 10))}`;
}

/* ---------- 업무 묶기 ---------- */

export type Tally = { todo: number; doing: number; done: number; late: number; total: number };

export function tally(tasks: Task[], today: string): Tally {
  const t: Tally = { todo: 0, doing: 0, done: 0, late: 0, total: tasks.length };
  for (const x of tasks) {
    if (x.status === 0) t.todo++;
    else if (x.status === 1) t.doing++;
    else t.done++;
    if (isLate(x.due, x.status, today)) t.late++;
  }
  return t;
}

/**
 * 표에서 읽는 순서: 안 끝난 것 먼저, 그 안에서 기한이 급한 것 먼저.
 * 기한 없는 업무는 기한 있는 것들 뒤로 — 날짜가 붙은 줄이 위에서 눈에 걸리게 한다.
 *
 * `pin` 은 방금 만든 줄이다. 새 업무는 제목도 기한도 없어서 정렬대로 두면 표 아래쪽에
 * 묻힌다 — 만든 사람 눈앞에 있어야 바로 채운다.
 */
export function sortTasks(tasks: Task[], pin?: string): Task[] {
  return tasks.slice().sort((a, b) => {
    if (pin && (a.id === pin) !== (b.id === pin)) return a.id === pin ? -1 : 1;
    if ((a.status === 2) !== (b.status === 2)) return a.status === 2 ? 1 : -1;
    if (Boolean(a.due) !== Boolean(b.due)) return a.due ? -1 : 1;
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return 0;
  });
}

/** 브라우저에 randomUUID 가 없을 수도 있다(구형·비보안 컨텍스트). 그때는 손으로 만든다. */
export function newId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}
