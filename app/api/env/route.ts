import "server-only";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 설정 점검용. **이름과 '값이 있는지' 만** 내보낸다 — 값은 절대 내보내지 않는다.
 *
 * 환경변수를 손으로 넣었는데 화면이 반응하지 않을 때, 이름을 잘못 적었는지 · 환경을 잘못
 * 골랐는지 · 값이 비었는지를 대시보드를 열지 않고 가릴 수 있어야 한다. Secret 으로 저장하면
 * 대시보드에서도 값을 다시 못 보기 때문에 이 창구가 없으면 확인할 방법이 없다.
 *
 * 여기 뜨는 이름은 전부 저장소에 그대로 적혀 있는 것들이라(README · .env.example) 비밀이 아니다.
 */
const WATCH = /^(BOARD_|SHEET_|FEED_|KV_|UPSTASH_|STORAGE_|REDIS_)/;

export async function GET() {
  const names = Object.keys(process.env).filter((k) => WATCH.test(k)).sort();
  const seen: Record<string, string> = {};
  for (const k of names) {
    const v = process.env[k] ?? "";
    // 길이만 알려 준다. 값이 들어갔는지, 공백만 들어갔는지가 이것으로 갈린다.
    seen[k] = v ? `설정됨 (${v.trim().length}자)` : "빈 값";
  }
  return NextResponse.json(
    {
      note: "이름과 길이만 보여 줍니다. 값은 내보내지 않습니다.",
      env: process.env.VERCEL_ENV ?? "local",
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      found: seen,
      missing: names.length ? undefined : "감시 대상 환경변수가 하나도 없습니다.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
