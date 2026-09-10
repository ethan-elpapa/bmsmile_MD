import { NextResponse } from "next/server";
import { keyRequired, mayApply, whoIs } from "@/lib/auth";
import { normalize } from "@/lib/seed";
import { readBoard, StoreConfigError, writeBoard } from "@/lib/store";
import type { BoardState } from "@/lib/types";

export const dynamic = "force-dynamic";

const keyOf = (req: Request) => req.headers.get("x-board-key");

function fail(e: unknown) {
  const status = e instanceof StoreConfigError ? 503 : 500;
  const message = e instanceof Error ? e.message : "알 수 없는 오류";
  return NextResponse.json({ error: message }, { status });
}

/**
 * 읽기는 누구나 된다. 키를 같이 보내면 **그 키가 누구인지**도 알려 준다 —
 * 화면이 "내 칸만 열어 주는" 일을 하려면 자기가 누군지 알아야 한다.
 */
export async function GET(req: Request) {
  try {
    const state = await readBoard();
    const who = whoIs(keyOf(req));
    return NextResponse.json({
      state,
      keyRequired: keyRequired(),
      // 키가 틀렸으면 아무것도 아닌 사람이다(읽기는 그래도 된다).
      me: who?.kind === "member" ? who.id : null,
      lead: who?.kind === "lead" || who?.kind === "open",
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request) {
  const who = whoIs(keyOf(req));
  if (!who) {
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

    /*
     * **정규화를 먼저 하고 나서 권한을 본다.** 보내온 값을 그대로 견주면
     * 모양만 다른(숫자가 문자열로 온 것 같은) 요청이 권한 위반으로 잡힌다.
     */
    const clean = normalize(body.state);
    const verdict = mayApply(current, clean, who);
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.why }, { status: 403 });
    }

    const next: BoardState = {
      ...clean,
      rev: current.rev + 1,
      updated: new Date().toISOString(),
    };
    await writeBoard(next);
    return NextResponse.json({ state: next });
  } catch (e) {
    return fail(e);
  }
}
