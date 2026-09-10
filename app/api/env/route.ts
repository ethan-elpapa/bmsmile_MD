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

/**
 * 편집 키를 걸어 두면 이 창구도 그 키가 있어야 열린다 — 보드를 고칠 수 있는 사람이면
 * 설정도 볼 수 있다는 규칙이다. 키를 안 걸어 둔 보드라면 감출 것도 없어서 그냥 열어 둔다.
 * (`BOARD_WRITE_KEY` 가 비어 있으면 어차피 누구나 보드를 고칠 수 있다.)
 */
function authorized(req: Request) {
  const want = process.env.BOARD_WRITE_KEY;
  if (!want) return true;
  return req.headers.get("x-board-key") === want;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "편집 키가 필요합니다. x-board-key 헤더로 보내세요." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

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
