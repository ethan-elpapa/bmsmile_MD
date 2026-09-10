import {
  BOARD_VERSION,
  type BoardState,
  brandOr,
  BRAND_IDS,
  BRAND_METRIC_KEYS,
  BRANDS,
  CHANNEL_IDS,
  CHANNELS,
  channelOr,
  isMonthKey,
  MARKETS,
  marketOr,
  type Member,
  type Metric,
  type Month,
  monthKey,
  type Project,
  type Status,
  STATUSES,
  type Task,
  type Unit,
  type Week,
  type WeekItem,
  UNITS,
} from "./types";

/**
 * 처음 만들어질 때의 월 지표. **채널마다 같은 네 칸**이라 두 줄을 위아래로 바로 견줄 수 있다.
 * 필요해지면 화면의 '지표 편집' 으로 줄을 늘리거나 이름·단위를 바꾼다.
 * 광고비 둘은 `lower` 다 — 목표보다 덜 쓴 게 잘한 것이라 색이 반대로 간다.
 */
type MetricDef = {
  key: string;
  name: string;
  unit: Unit;
  lower: boolean;
  basisKey?: string;
  basisName?: string;
};

const BRAND_METRICS: MetricDef[] = [
  { key: "revenue", name: "총매출", unit: "usd", lower: false },
  { key: "roas", name: "총 ROAS", unit: "mult", lower: false },
  /*
   * 광고비 둘은 목표를 안 받는다. 쓴 금액과 그게 매출의 몇 %인지만 보여 준다 —
   * 두 비율을 더하면 그 채널의 총 TACoS 다(내부 10.1% + 외부 1.9% = 12.0%).
   */
  { key: "adspend", name: "내부 광고비", unit: "usd", lower: true, basisKey: "revenue", basisName: "TACoS" },
  { key: "extspend", name: "외부 광고비", unit: "usd", lower: true, basisKey: "revenue", basisName: "TACoS" },
];

/** 시트에서 값이 오는 키들. 여기 없는 지표는 손으로 넣는다. */
const FED_KEYS = new Set<string>(BRAND_METRIC_KEYS);

/**
 * 브랜드 × 마켓 한 칸에 **채널 줄들**을 깔아 준다. 탭을 새로 열 때도 이걸 쓴다.
 * 화면 한 장이 딱 이만큼이다 — 채널 2줄 × 지표 4칸.
 */
export function metricsForCell(brand: string, market: string): Metric[] {
  return CHANNELS.flatMap((c) =>
    BRAND_METRICS.map((m) => ({
      id: `m-${market}-${brand}-${c.id}-${m.key}`,
      name: m.name,
      unit: m.unit,
      target: 0,
      actual: 0,
      brand,
      market,
      channel: c.id,
      lower: m.lower,
      basisKey: m.basisKey ?? "",
      basisName: m.basisName ?? "",
      // 시트가 계산해 주는 값만 키를 붙인다. 나머지는 손으로 넣는 칸이 된다.
      src: FED_KEYS.has(m.key) ? `${market}.${brand}.${c.id}.${m.key}` : "",
    })),
  );
}

/**
 * 처음 만들어지는 달에는 **첫 마켓(미국)의 모든 브랜드**가 깔린다.
 * 다른 마켓은 그 탭을 열 때 만든다 — 안 하는 나라의 빈 줄을 미리 만들어 둘 이유가 없다.
 */
export const SEED_METRICS: Metric[] = BRANDS.flatMap((b) => metricsForCell(b.id, MARKETS[0].id));

/**
 * 처음 만들어질 때의 팀원. **화면에서 고치거나 지운 뒤에는 여기를 바꿔도 소용없다** —
 * 팀원은 코드가 아니라 보드가 들고 있고, 이 값은 보드가 처음 세워질 때만 쓰인다.
 * 역할과 이번 달 포커스는 각자 화면에서 채운다.
 */
export const SEED_MEMBERS: Member[] = [
  { id: "p-oyc", name: "오유찬", role: "팀장", focus: "" },
  { id: "p-lyy", name: "임영유", role: "파트장", focus: "" },
  { id: "p-lhjung", name: "이현정", role: "파트장", focus: "" },
  { id: "p-lhj", name: "이호준", role: "사원", focus: "" },
  { id: "p-ajh", name: "안종현", role: "사원", focus: "" },
];

export function freshMonth(): Month {
  return { metrics: SEED_METRICS.map((m) => ({ ...m })) };
}

/**
 * 지난달 구성을 새 달로 가져온다. **목표는 들고 오고 실적은 비운다** —
 * 지난달 숫자가 남아 있으면 이번 달을 이미 채운 것으로 읽는다.
 * id 도 새로 만든다. 두 달이 같은 id 를 쓰면 한쪽을 지울 때 헷갈린다.
 */
export function carryMonth(prev: Month, newId: () => string): Month {
  return {
    metrics: prev.metrics.map((m) => ({ ...m, id: newId(), actual: 0 })),
  };
}

export function seed(): BoardState {
  return {
    v: BOARD_VERSION,
    rev: 0,
    updated: null,
    months: { [monthKey(new Date())]: freshMonth() },
    members: SEED_MEMBERS.map((m) => ({ ...m })),
    projects: [],
    tasks: [],
    weeks: [],
  };
}

/* ---------- 정규화 ---------- */

/**
 * 확장 진행판과 다른 점: 팀원·프로젝트·업무는 코드가 아니라 화면에서 만든다.
 * 그래서 여기서는 '코드가 아는 목록으로 맞추는' 게 아니라 '저장된 것을 믿되 모양만 고친다'.
 */

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");

/** 저장된 값이 문자열로 넘어와도 받는다. 화면의 숫자 칸이 문자열을 보낼 때가 있다. */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function status(v: unknown): Status {
  const n = Number(v);
  return (STATUSES as number[]).includes(n) ? (n as Status) : 0;
}

function unit(v: unknown): Unit {
  return UNITS.includes(v as Unit) ? (v as Unit) : "usd";
}

/** 날짜 칸은 비어 있거나 YYYY-MM-DD 다. 그 밖의 값은 빈 칸으로 돌린다. */
function date(v: unknown): string {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/**
 * 링크 칸. `javascript:` 같은 스킴은 여기서 떨군다 — 남이 적은 주소를 다른 팀원이 누르는 칸이라
 * 화면에서 거르는 것만으로는 부족하다. 스킴 없이 적은 주소(`docs.google.com/…`)는 그대로 두고,
 * 열 때 https:// 를 붙인다.
 */
function link(v: unknown): string {
  const s = str(v, 500).trim();
  if (!s) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:/i.test(s) ? "" : s;
}

/**
 * id 는 화면에서 만들어 붙는다. 비었거나 겹치면 여기서 새로 준다 —
 * 겹친 id 는 한 줄을 고칠 때 다른 줄까지 같이 바뀌게 만든다.
 */
function idFixer() {
  const seen = new Set<string>();
  let n = 0;
  return (v: unknown) => {
    const s = str(v, 64).trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      return s;
    }
    let made = `x${Date.now().toString(36)}${(n++).toString(36)}`;
    while (seen.has(made)) made += "0";
    seen.add(made);
    return made;
  };
}

/** 2026-09-10 이전의 주간 모양. 정규화에서 항목 하나씩으로 옮기고 나면 다시 안 쓴다. */
type LegacyWeek = { note?: unknown; notes?: unknown };

function arr(v: unknown, max: number): unknown[] {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

/**
 * 피드 키를 `마켓.브랜드.채널.지표` 네 토막으로 맞춘다. 앞선 구조에서 저장된 값을 끌어온다 —
 * 두 토막(`브랜드.지표`)은 마켓 축이 없던 시절, 세 토막은 채널 축이 없던 시절이다.
 * 그때 쌓인 건 전부 미국 아마존 숫자다.
 */
function srcKey(v: unknown, market: string, brand: string, channel: string): string {
  const s = str(v, 60).trim();
  if (!s) return "";
  const n = s.split(".").length;
  if (n === 2) return `${market}.${brand}.${channel}.${s.split(".")[1]}`;
  if (n === 3) return `${market}.${brand}.${channel}.${s.split(".")[2]}`;
  return s;
}

/**
 * 자사몰이 '브랜드' 였던 시절의 지표를 채널로 옮긴다.
 * 그 줄에는 브랜드가 없었으므로 첫 브랜드로 붙는다 — 어느 탭에서도 안 보이는 지표를 만들지 않는 게
 * 먼저다. 잘못 붙은 줄은 화면에서 지우면 된다.
 */
function splitLegacyGroup(group: unknown, brandRaw: unknown, channelRaw: unknown) {
  const g = str(group, 40);
  if (CHANNEL_IDS.includes(g) && g !== CHANNELS[0].id) {
    return { brand: brandOr(brandRaw), channel: g };
  }
  return { brand: brandOr(brandRaw ?? g), channel: channelOr(channelRaw) };
}

/**
 * 모르는 브랜드는 버리고 중복은 없앤다. 순서는 늘 BRAND_IDS 순서 — 저장된 순서를 그대로 두면
 * 같은 조합인데 줄마다 칩 순서가 달라 보인다.
 * 목록에서 빠진 브랜드(예: 나중에 위글위글을 빼면)의 태그는 여기서 조용히 사라진다.
 */
function brands(v: unknown): string[] {
  const got = new Set(arr(v, 10).map((x) => str(x, 40)));
  return BRAND_IDS.filter((id) => got.has(id));
}

function normalizeMonth(raw: unknown): Month {
  const m = (raw ?? {}) as Partial<Month>;
  const fixId = idFixer();
  return {
    metrics: arr(m.metrics, 160).map((x) => {
      const r = (x ?? {}) as Partial<Metric> & { group?: unknown };
      const market = marketOr(r.market);
      const { brand, channel } = splitLegacyGroup(r.group, r.brand, r.channel);
      return {
        id: fixId(r.id),
        name: str(r.name, 60) || "이름 없는 지표",
        unit: unit(r.unit),
        target: num(r.target),
        actual: num(r.actual),
        brand,
        market,
        channel,
        lower: r.lower === true,
        basisKey: str(r.basisKey, 40),
        basisName: str(r.basisName, 20),
        src: srcKey(r.src, market, brand, channel),
      };
    }),
  };
}

export function normalize(raw: unknown): BoardState {
  const base = seed();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<BoardState>;

  const fixMember = idFixer();
  const members: Member[] = arr(s.members, 60).map((x) => {
    const r = (x ?? {}) as Partial<Member>;
    return {
      id: fixMember(r.id),
      name: str(r.name, 40) || "이름 없음",
      role: str(r.role, 60),
      focus: str(r.focus, 200),
    };
  });
  const memberIds = new Set(members.map((m) => m.id));

  const fixProject = idFixer();
  const projects: Project[] = arr(s.projects, 100).map((x) => {
    const r = (x ?? {}) as Partial<Project>;
    const owner = str(r.owner, 64);
    return {
      id: fixProject(r.id),
      name: str(r.name, 80) || "이름 없는 프로젝트",
      goal: str(r.goal, 300),
      // 팀원이 지워졌으면 담당 미정으로 돌린다. 없는 사람을 가리키면 화면에서 빈칸이 된다.
      owner: memberIds.has(owner) ? owner : "",
      due: date(r.due),
      status: status(r.status),
      brands: brands(r.brands),
    };
  });
  const projectIds = new Set(projects.map((p) => p.id));

  const fixTask = idFixer();
  const tasks: Task[] = arr(s.tasks, 1000).map((x) => {
    const r = (x ?? {}) as Partial<Task>;
    const assignee = str(r.assignee, 64);
    const project = str(r.project, 64);
    return {
      id: fixTask(r.id),
      title: str(r.title, 200),
      assignee: memberIds.has(assignee) ? assignee : "",
      project: projectIds.has(project) ? project : "",
      due: date(r.due),
      status: status(r.status),
      note: str(r.note, 500),
      url: link(r.url),
      brands: brands(r.brands),
    };
  });

  /*
   * 주간 기록. 아직 안 쓴 주는 저장하지 않는다 — 화면이 그 달 주차를 계산해서 빈 줄을 만들고,
   * 뭔가 적히거나 확인이 찍힐 때 비로소 저장에 남는다.
   */
  // 항목 id 는 주 전체에서 겹치지 않게 한 통에서 고른다.
  const fixItem = idFixer();

  const weeks: Week[] = arr(s.weeks, 400)
    .map((x) => {
      const r = (x ?? {}) as Partial<Week> & LegacyWeek;
      const items: WeekItem[] = arr(r.items, 200).map((y) => {
        const it = (y ?? {}) as Partial<WeekItem>;
        const by = str(it.by, 64);
        return {
          id: fixItem(it.id),
          // 지금 없는 팀원의 글은 컨펌 요청 줄로 내려온다 — 화면에 안 뜨는 글을 만들지 않는다.
          by: memberIds.has(by) ? by : "",
          text: str(it.text, 2000),
          done: it.done === true,
          doneAt: it.done === true ? date(it.doneAt) : "",
        };
      });

      /*
       * 사람별 칸 하나 · 주 전체 비고 하나로 쓰던 때의 모양(2026-09-10 이전).
       * 항목 하나씩으로 옮긴다 — 적어 둔 글이 사라지지 않게.
       */
      if (!items.length) {
        const legacy = (r.notes ?? {}) as Record<string, unknown>;
        for (const id of memberIds) {
          const t = str(legacy[id], 2000);
          if (t) items.push({ id: fixItem(""), by: id, text: t, done: false, doneAt: "" });
        }
        const shared = str(r.note, 2000);
        if (shared) items.push({ id: fixItem(""), by: "", text: shared, done: false, doneAt: "" });
      }

      return { id: date(r.id), items };
    })
    .filter((w) => w.id);

  const months: Record<string, Month> = {};
  const rawMonths = (s.months ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(rawMonths).filter(isMonthKey).sort().slice(-60)) {
    months[k] = normalizeMonth(rawMonths[k]);
  }
  // 한 달도 안 남으면 화면이 기댈 곳이 없다. 이번 달을 기본값으로 세워 준다.
  if (Object.keys(months).length === 0) months[monthKey(new Date())] = freshMonth();

  return {
    v: BOARD_VERSION,
    rev: typeof s.rev === "number" && s.rev >= 0 ? s.rev : 0,
    updated: typeof s.updated === "string" ? s.updated : null,
    months,
    members,
    projects,
    tasks,
    weeks,
  };
}
