import Board from "@/components/Board";
import { EMPTY_FEED, type Feed, feedLinked, readFeed } from "@/lib/feed";
import { readBoard, storeKind, StoreConfigError } from "@/lib/store";
import { type BoardState, monthKey } from "@/lib/types";
import { BUILD_SHA } from "./layout";

export const dynamic = "force-dynamic";

export default async function Page() {
  // try/catch 는 데이터 취득까지만 감싼다. JSX 를 안에서 만들면 렌더 에러가 여기 잡히지 않는다.
  let state: BoardState | null = null;
  let err: Error | null = null;
  try {
    state = await readBoard();
  } catch (e) {
    err = e as Error;
  }

  if (!state) return <Setup err={err} />;

  /*
   * 첫 화면이 여는 달의 실적을 미리 실어 보낸다. 달을 바꾸면 화면이 /api/feed 를 부른다.
   * 시트가 안 붙어 있거나 못 읽으면 빈 피드가 가고, 보드는 저장된 값으로 그대로 그려진다.
   */
  const first = monthKey(new Date());
  let feed: Feed = EMPTY_FEED;
  try {
    feed = await readFeed(first);
  } catch {
    /* 시트 때문에 보드가 안 뜨는 일은 없어야 한다 */
  }

  return (
    <Board
      initial={state}
      initialFeed={feed}
      feedMonth={first}
      feedLinked={feedLinked()}
      keyRequired={Boolean(process.env.BOARD_WRITE_KEY)}
      ephemeralStore={storeKind() === "file"}
      build={BUILD_SHA}
    />
  );
}

function Setup({ err }: { err: Error | null }) {
  const missing = err instanceof StoreConfigError;
  return (
    <div className="setup">
      <h1>{missing ? "저장소가 아직 연결되지 않았습니다" : "보드를 읽지 못했습니다"}</h1>
      <p>{err?.message ?? "알 수 없는 오류"}</p>
      {missing ? (
        <>
          <p>
            Vercel 프로젝트 → <strong>Storage</strong> 에서 Redis 를 붙이면 아래 두 값이 자동으로 들어옵니다. 넣은 뒤
            재배포하세요.
          </p>
          <pre>{`KV_REST_API_URL=<Redis REST 주소>
KV_REST_API_TOKEN=<Redis REST 토큰>

# 선택 — 넣으면 이 키를 아는 사람만 고칠 수 있다
BOARD_WRITE_KEY=<팀에서 공유할 편집 키>`}</pre>
          <p>
            로컬에서는 두 값이 없어도 <code>.data/board.json</code> 파일에 저장하며 돌아갑니다. 그 경로는 커밋되지
            않습니다.
          </p>
        </>
      ) : (
        <p>저장소 주소나 토큰이 맞는지 확인하세요.</p>
      )}
    </div>
  );
}
