import { NextResponse } from "next/server";
import { normalize } from "@/lib/seed";
import { readBoard, StoreConfigError, writeBoard } from "@/lib/store";
import type { BoardState } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 편집 키를 안 걸어 두면 링크를 아는 사람 누구나 고칠 수 있다. 화면에서 그렇게 알린다. */
export function writeKeyRequired() {
  return Boolean(process.env.BOARD_WRITE_KEY);
}

function authorized(req: Request) {
  const want = process.env.BOARD_WRITE_KEY;
  if (!want) return true;
  return req.headers.get("x-board-key") === want;
}

function fail(e: unknown) {
  const status = e instanceof StoreConfigError ? 503 : 500;
  const message = e instanceof Error ? e.message : "알 수 없는 오류";
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const state = await readBoard();
    return NextResponse.json({ state, keyRequired: writeKeyRequired() });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "편집 키가 맞지 않습니다." }, { status: 401 });
  }

  let body: { rev?: number; state?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "본문을 읽지 못했습니다." }, { status: 400 });
  }
  if (!body.state || typeof body.rev !== "number") {
    return NextResponse.json({ error: "rev 와 state 가 필요합니다." }, { status: 400 });
  }

  try {
    const current = await readBoard();
    // 읽고 쓰는 사이는 잠기지 않는다. 같은 순간에 두 사람이 저장하면 한쪽이 밀릴 수 있고,
    // rev 검사는 그중 대부분을 잡아 준다. 완전한 배타가 필요해지면 그때 DB 로 옮긴다.
    if (body.rev !== current.rev) {
      return NextResponse.json(
        { error: "다른 사람이 먼저 저장했습니다.", state: current, rev: current.rev },
        { status: 409 },
      );
    }

    const next: BoardState = {
      ...normalize(body.state),
      rev: current.rev + 1,
      updated: new Date().toISOString(),
    };
    await writeBoard(next);
    return NextResponse.json({ state: next });
  } catch (e) {
    return fail(e);
  }
}
