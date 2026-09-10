/** 0 시작 전 · 1 진행 · 2 완료. 숫자 그대로 저장한다. 확장 진행판과 같은 규칙. */
export type Status = 0 | 1 | 2;

/** 상태 칸을 누르면 이 순서로 돈다. */
export const STATUSES: Status[] = [0, 1, 2];

export const STATUS_LABEL: Record<Status, string> = {
  0: "시작 전",
  1: "진행",
  2: "완료",
};

/**
 * 지표의 단위. 숫자를 어떻게 보여 줄지가 여기서 갈린다.
 * usd 는 천 단위 구분, pct 와 mult 는 소수 한 자리, cnt 는 정수.
 * ROAS 를 배수(3.5) 대신 퍼센트(350%) 로 쓰고 싶으면 화면에서 단위만 바꾸면 된다.
 */
export type Unit = "usd" | "pct" | "cnt" | "mult";

export const UNITS: Unit[] = ["usd", "pct", "cnt", "mult"];

export const UNIT_LABEL: Record<Unit, string> = {
  usd: "USD",
  pct: "%",
  cnt: "건",
  mult: "배",
};

/**
 * 업무에 붙는 브랜드. **여기가 유일한 출처다** — 위글위글을 붙일 때는 이 배열에 한 줄 넣고
 * `app/globals.css` 의 `.bchip[data-b=...]` 에 색을 하나 더 준다. 그 밖에 고칠 곳은 없다.
 * id 와 색은 국가 확장 진행판과 같은 값을 쓴다.
 */
export type BrandTag = { id: string; name: string };

export const BRANDS: BrandTag[] = [
  { id: "mumuki", name: "무무키" },
  { id: "pethroom", name: "페스룸" },
];

export const BRAND_IDS = BRANDS.map((b) => b.id);

/** 저장된 값이 지금 아는 브랜드가 아니면 첫 브랜드로 본다 — 어느 탭에서도 안 보이는 지표를 안 만든다. */
export function brandOr(v: unknown): string {
  return typeof v === "string" && BRAND_IDS.includes(v) ? v : BRANDS[0].id;
}

/**
 * 판매 채널. 월 목표에서 **줄**이 되는 축이다(브랜드 탭 → 마켓 탭 → 채널 줄).
 * 여기가 유일한 출처다 — 채널을 늘리면 모든 브랜드·마켓의 줄이 같이 늘어난다.
 */
export type Channel = { id: string; name: string };

export const CHANNELS: Channel[] = [
  { id: "amazon", name: "아마존" },
  { id: "d2c", name: "자사몰" },
];

export const CHANNEL_IDS = CHANNELS.map((c) => c.id);

export function channelOr(v: unknown): string {
  return typeof v === "string" && CHANNEL_IDS.includes(v) ? v : CHANNELS[0].id;
}

/**
 * 월 목표의 마켓 탭. **여기가 유일한 출처다** — 캐나다를 열 때는 이 배열에 한 줄 넣으면
 * 탭이 생기고, 그 탭에서 `기본 지표 만들기` 를 누르면 브랜드 줄이 깔린다.
 * 순서가 탭 순서다. 첫 줄이 기본으로 열리는 탭이다.
 */
export type Market = { id: string; code: string; name: string };

export const MARKETS: Market[] = [{ id: "us", code: "US", name: "미국" }];

export const MARKET_IDS = MARKETS.map((m) => m.id);

/** 저장된 값이 지금 아는 마켓이 아니면 첫 마켓으로 본다. 지금까지 쌓인 건 전부 미국 숫자다. */
export function marketOr(v: unknown): string {
  return typeof v === "string" && MARKET_IDS.includes(v) ? v : MARKETS[0].id;
}

/** 고르고 끄는 건 화면에서 하고, 순서는 늘 BRANDS 순서로 맞춘다. */
export function toggleBrand(list: string[], id: string): string[] {
  const next = new Set(list);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return BRAND_IDS.filter((b) => next.has(b));
}

/** 월 목표 한 줄. 목표와 실적을 나란히 들고 달성률은 화면에서 계산한다. */
export type Metric = {
  id: string;
  name: string;
  unit: Unit;
  target: number;
  actual: number;
  /*
   * 지표 하나는 **브랜드 × 마켓 × 채널** 한 칸에 산다. 셋 다 반드시 채워진다 —
   * 하나라도 비어 있으면 어느 탭에서도 안 보이는 지표가 생기기 때문에,
   * 정규화에서 모르는 값은 첫 항목으로 끌어온다.
   */
  brand: string;
  market: string;
  channel: string;
  /**
   * true 면 **적을수록 좋은 지표**(광고비 같은 예산). 목표보다 덜 쓴 게 잘한 것이라
   * 달성률이 아니라 소진율로 읽고 색도 반대로 간다.
   */
  lower: boolean;
  /**
   * 값을 나눠 볼 **기준 지표의 키**(같은 칸 안에서 찾는다). 광고비에 `"revenue"` 를 걸면
   * 광고비 ÷ 매출 = TACoS 가 카드 오른쪽에 계산돼서 뜬다.
   *
   * **이 칸은 목표를 받지 않는다** — 사람이 넣을 게 없고 시트 숫자로만 나오는 지표다.
   * 그래서 목표 입력·막대·푸터가 다 빠지고, 이름과 값과 비율만 남는다.
   */
  basisKey: string;
  /** 그 비율을 화면에서 부르는 이름. 광고비 ÷ 매출이면 `TACoS`. */
  basisName: string;
  /**
   * 실적을 시트에서 받아 오는 지표면 `"us.mumuki.amazon.revenue"` 같은 키
   * (마켓 · 브랜드 · 채널 · 지표). 빈 문자열이면 손으로 넣는다.
   * 시트에 그 달 값이 없으면 저장된 `actual` 로 물러나고 칸도 다시 열린다 —
   * 연결됐다는 이유로 못 고치는 칸이 남지 않게.
   */
  src: string;
};

/**
 * 시트에서 계산해 올 수 있는 값들. 지표의 `src` 마지막 토막이 이 중 하나다.
 * **ACoS 는 여기 없다** — 광고비 ÷ 광고매출인데 시트에 광고매출 열이 없다.
 */
export const BRAND_METRIC_KEYS = ["revenue", "roas", "adspend", "extspend"] as const;

/**
 * 시트에서 읽어 온 한 달치. 화면에도 가야 해서 서버 전용 모듈이 아니라 여기 둔다
 * (`lib/feed.ts` 는 "server-only" 라 클라이언트에서 import 하면 빌드가 막힌다).
 */
export type Feed = {
  /** "us.mumuki.amazon.revenue" → 값. 지표의 `src` 가 이 키를 가리킨다. */
  values: Record<string, number>;
  /** "us.mumuki.amazon" 별로 시트가 어디까지 채워져 있는지 (YYYY-MM-DD). */
  through: Record<string, string>;
  /** 읽다가 실패한 "us.mumuki.amazon" → 이유. 화면은 저장된 값으로 물러난다. */
  failed: Record<string, string>;
};

export const EMPTY_FEED: Feed = { values: {}, through: {}, failed: {} };

/** "2026-09" 한 달치. 지금은 지표뿐이지만 월 단위로 더 붙일 자리를 남겨 둔다. */
export type Month = {
  metrics: Metric[];
};

export type Member = {
  id: string;
  name: string;
  role: string;
  /** 이번 달 이 사람이 붙어 있는 한 줄. 업무 목록보다 먼저 읽히는 자리다. */
  focus: string;
};

/**
 * 프로젝트성 목표. 진행률은 연결된 업무에서 계산하고, 상태는 사람이 직접 돌린다.
 *
 * **담당자 칸이 없다.** 한 프로젝트를 여러 명이 맡기 때문에 한 명만 적는 칸은 맞지 않는다 —
 * 누가 붙어 있는지는 그 프로젝트에 걸린 **업무의 담당자**에서 나온다.
 */
export type Project = {
  id: string;
  name: string;
  goal: string;
  due: string;
  status: Status;
  /** BRANDS 의 id 들. 업무와 같은 규칙 — 없을 수도, 여러 개일 수도 있다. */
  brands: string[];
};

export type Task = {
  id: string;
  title: string;
  /** Member.id 또는 "" (미배정) */
  assignee: string;
  /** Project.id 또는 "" (상시 업무) */
  project: string;
  due: string;
  status: Status;
  note: string;
  /** 관련 링크 하나. 스킴 없이 적어도 열 때 https:// 를 붙인다. */
  url: string;
  /** BRANDS 의 id 들. 없을 수도, 둘 다일 수도 있다. */
  brands: string[];
};

/**
 * 한 주. **월요일 날짜(YYYY-MM-DD)가 곧 id** 라서 따로 주차 번호를 세지 않는다 —
 * 연말에 주차 번호가 꼬이는 문제를 처음부터 안 만든다.
 *
 * **진행 내용은 사람마다 따로 적는다**(`notes`). 한 칸을 다 같이 쓰면 누가 쓴 말인지
 * 알 수 없고, 두 사람이 같이 고치면 서로의 글을 덮는다.
 * 그 주에 기한이 걸린 업무 수와 사람은 저장하지 않는다 — 업무 목록에서 센다.
 */
/**
 * 주간 기록 한 줄. **한 사람이 한 주에 여러 개를 적는다** — 그래서 컨펌도 하나씩 따로 된다.
 * 한 칸에 다 몰아 적으면 "어디까지 봤는지" 를 표시할 수가 없다.
 */
export type WeekItem = {
  id: string;
  /** 적은 사람의 Member.id. **빈 문자열이면 컨펌 요청** — 사람에게 안 붙는 줄이다. */
  by: string;
  text: string;
  /** 팀장이 완료로 표시했는지. 미완료가 기본이다. */
  done: boolean;
  /** 완료로 바꾼 날 YYYY-MM-DD */
  doneAt: string;
};

export type Week = {
  /** 그 주 월요일. "2026-09-08" */
  id: string;
  /** 그 주에 적힌 항목들. 사람별 진행 내용과 컨펌 요청이 같이 들어 있다. */
  items: WeekItem[];
};

/** 그 주에 적힌 게 하나라도 있는지. 아무것도 없으면 저장에 넣지 않는다. */
export function weekIsEmpty(w: Week): boolean {
  return w.items.length === 0;
}

/** 컨펌 요청 — 사람에게 안 붙는 항목. `by` 가 빈 문자열인 것들이다. */
export const ASK = "";

/** 그 날짜가 속한 주의 월요일. 주 시작을 월요일로 잡는다. */
export function weekIdOf(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  // getDay(): 0=일요일. 월요일을 0 으로 옮겨서 뺀다.
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/**
 * 그 달에 걸치는 주들의 월요일 목록. 달 첫날이 목요일이면 그 주는 앞 달에서 시작하는데,
 * 그 주도 이 달의 일을 담고 있으므로 포함한다.
 */
export function weeksOfMonth(monthId: string): string[] {
  const [y, m] = monthId.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    const id = weekIdOf(`${monthId}-${String(d).padStart(2, "0")}`);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 그 주의 n 일째 날짜(0=월요일). 주 안에 기한을 잡아 줄 때 쓴다. */
export function weekDate(id: string, n: number): string {
  const [y, m, d] = id.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** "2026-09-08" → "9/8–9/14" */
export function weekLabel(id: string): string {
  const [y, m, d] = id.split("-").map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date(y, m - 1, d + 6);
  return `${a.getMonth() + 1}/${a.getDate()}–${b.getMonth() + 1}/${b.getDate()}`;
}

export type BoardState = {
  v: number;
  /** 저장할 때마다 1 오른다. 낙관적 잠금의 기준. */
  rev: number;
  updated: string | null;
  /** "YYYY-MM" → 그 달의 목표. 없는 달은 화면에서 만들어 준다. */
  months: Record<string, Month>;
  members: Member[];
  projects: Project[];
  tasks: Task[];
  /** 주간 기록. 월요일 날짜를 id 로 쓰는 한 줄들 */
  weeks: Week[];
};

export const BOARD_VERSION = 1;

/** "2026-09" 형태인지. 월 키는 이 모양이 아니면 버린다. */
export function isMonthKey(s: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 월 키를 n 달 옮긴다. Date 를 거치므로 12월 넘어가는 것도 알아서 된다. */
export function shiftMonth(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${y}년 ${m}월`;
}
