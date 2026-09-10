import "server-only";
import { BRAND_METRIC_KEYS, BRANDS, CHANNELS, EMPTY_FEED, type Feed, MARKETS } from "./types";

export { EMPTY_FEED };
export type { Feed };

/**
 * 시트에서 실적을 읽어 온다.
 *
 * **서비스 계정을 쓰지 않는다.** 매출 시트가 '링크가 있는 사람은 보기' 로 열려 있어서
 * CSV 내보내기 주소를 그냥 부르면 된다 — 자격증명도, 패키지도 필요 없다.
 * 시트 공유를 조이면 이 길이 막힌다. 그때는 `../amz-us-board/lib/sheets.ts` 의
 * 서비스 계정(JWT) 방식을 가져오면 되고, 그 시트는 이미 그 계정에 공유돼 있다.
 *
 * 여기서 읽은 값은 **보드에 저장하지 않는다.** 화면에 얹기만 한다 —
 * 저장하면 두 사람이 같은 칸을 쓰는 꼴이 되고, 시트가 고쳐졌을 때 보드만 옛날 값으로 남는다.
 */

export class FeedError extends Error {}

/** 한 브랜드의 한 달치. 키는 BRAND_METRIC_KEYS 와 같은 이름을 쓴다. */
export type FeedValues = Partial<Record<(typeof BRAND_METRIC_KEYS)[number], number>>;


/**
 * 마켓 · 브랜드 · 채널 한 칸이 어느 시트의 어느 탭에서 오는지.
 * 시트 주소는 환경변수로 받는다 — 링크만 알면 열리는 문서라 코드에 박아 두지 않는다.
 * 이름은 `SHEET_<마켓>_<브랜드>_<채널>` — 캐나다 아마존이면 `SHEET_CA_MUMUKI_AMAZON` 이다.
 */
type Source = {
  /** "us.mumuki.amazon" — 피드 키의 앞 세 토막 */
  key: string;
  sheetId: string | undefined;
  gid: string;
};

function sources(): Source[] {
  const out: Source[] = [];
  for (const m of MARKETS) {
    for (const b of BRANDS) {
      for (const c of CHANNELS) {
        const env = `SHEET_${m.id.toUpperCase()}_${b.id.toUpperCase()}_${c.id.toUpperCase()}`;
        out.push({
          key: `${m.id}.${b.id}.${c.id}`,
          sheetId: process.env[env],
          gid: process.env[`${env}_GID`] || "0",
        });
      }
    }
  }
  return out;
}

/** 시트가 붙어 있는 "us.mumuki.amazon" 들. 화면이 어디에 안내를 띄울지 정하는 데 쓴다. */
export function feedLinked(): string[] {
  return sources().filter((s) => s.sheetId).map((s) => s.key);
}

/* ---------- CSV ---------- */

/** 따옴표 안의 쉼표와 줄바꿈을 살려서 자른다. 시트 값에 둘 다 들어 있다. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** "$1,234.56" · "₩1,234" · "" → 숫자. 못 읽으면 0. */
function money(s: string | undefined): number {
  const n = Number(String(s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 일별 롤업 탭의 열 자리. 이름이 아니라 위치로 찾는다 —
 * 이 탭은 머리글이 두 줄에 걸쳐 있고 병합된 칸이 많아 이름으로 잡기가 더 위험하다.
 * 열 순서가 바뀌면 여기를 고쳐야 한다.
 */
const COL = { date: 2, revenue: 4, extspend: 6, adspend: 8 } as const;

/** "9/2/26" → "2026-09-02". 그 밖의 모양은 건너뛴다(머리글·합계 줄). */
function isoDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `20${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function readSource(src: Source, month: string): Promise<{ values: FeedValues; through: string }> {
  const url =
    `https://docs.google.com/spreadsheets/d/${src.sheetId}/export` +
    `?format=csv&gid=${encodeURIComponent(src.gid)}`;

  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  if (!res.ok) {
    throw new FeedError(`시트를 읽지 못했습니다 (${res.status}). 공유 설정이 '링크가 있는 사람은 보기' 인지 확인하세요.`);
  }
  const text = await res.text();
  // 공유가 막히면 로그인 페이지 HTML 이 200 으로 돌아온다. CSV 가 아니면 여기서 잡는다.
  if (text.trimStart().startsWith("<")) {
    throw new FeedError("시트 대신 로그인 페이지가 왔습니다. 공유 설정이 '링크가 있는 사람은 보기' 인지 확인하세요.");
  }

  let revenue = 0;
  let adspend = 0;
  let extspend = 0;
  let through = "";
  let days = 0;

  for (const row of parseCSV(text)) {
    const iso = isoDate(row[COL.date] ?? "");
    if (!iso || !iso.startsWith(month)) continue;
    const rev = money(row[COL.revenue]);
    const amz = money(row[COL.adspend]);
    const ext = money(row[COL.extspend]);
    revenue += rev;
    adspend += amz;
    extspend += ext;
    // 아직 안 온 날은 0 으로 채워져 있다. 숫자가 하나라도 있는 날까지를 '채워진 날' 로 본다.
    if (rev || amz || ext) {
      through = iso;
      days++;
    }
  }

  if (!days) return { values: {}, through: "" };

  const total = adspend + extspend;
  return {
    values: {
      revenue,
      adspend,
      extspend,
      // 광고비가 0 인 달에 ROAS 를 무한대로 내보내지 않는다. 그 칸은 그냥 비운다.
      ...(total ? { roas: revenue / total } : {}),
    },
    through,
  };
}

export const REVALIDATE = Number(process.env.FEED_REVALIDATE_SECONDS || 300);

/** 한 달치를 마켓·브랜드별로 모아 온다. 한쪽이 실패해도 다른 쪽은 살린다. */
export async function readFeed(month: string): Promise<Feed> {
  const out: Feed = { values: {}, through: {}, failed: {} };

  await Promise.all(
    sources()
      .filter((s) => s.sheetId)
      .map(async (s) => {
        try {
          const got = await readSource(s, month);
          for (const [k, v] of Object.entries(got.values)) out.values[`${s.key}.${k}`] = v;
          if (got.through) out.through[s.key] = got.through;
        } catch (e) {
          out.failed[s.key] = e instanceof Error ? e.message : "알 수 없는 오류";
        }
      }),
  );

  return out;
}
