import { NextResponse } from "next/server";
import { EMPTY_FEED, readFeed } from "@/lib/feed";
import { isMonthKey } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 달을 바꾸면 화면이 이 주소를 부른다. 보드 저장과 완전히 따로 도는 길이다 —
 * 시트를 못 읽어도 보드는 저장된 값으로 그대로 굴러간다.
 */
export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "month 는 YYYY-MM 이어야 합니다." }, { status: 400 });
  }
  try {
    return NextResponse.json({ feed: await readFeed(month) });
  } catch {
    // readFeed 는 브랜드별로 실패를 삼키지만, 그 바깥에서 터지면 빈 피드로 돌린다.
    return NextResponse.json({ feed: EMPTY_FEED });
  }
}
