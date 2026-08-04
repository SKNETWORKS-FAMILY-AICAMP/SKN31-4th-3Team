/*
 * components/galaxy/MbtiSelector.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 화면 오른쪽에 세로로 늘어선 16유형.
 *
 * ★ 판을 두지 않는다
 *   칸을 나누거나 테두리를 두르면 우주 위에 표가 얹힌 모양이 된다.
 *   배경도 테두리도 없이 글자만 허공에 뜨게 하고, 고른 것만 밑줄로 표시한다.
 *
 * ★ 글자 자리만 포인터를 받는다
 *   목록 전체가 포인터를 먹으면 그 아래의 별을 누를 수 없다.
 *   컨테이너는 통과시키고 버튼만 받는다 (CSS 의 pointer-events 참조).
 *
 * ★ 단정하지 않는다
 *   "당신은 이런 사람"이 아니라 "지금 이 결과 가까운 은하"를 보여 줄 뿐이다.
 *
 * ★ 내 유형은 "고른 것"과 다르다
 *   가입할 때 남긴 유형은 언제나 은은히 빛나고 있고, 지금 고른 유형은
 *   밑줄로 표시된다. 둘은 같을 수도 다를 수도 있다 — 오늘은 다른 결을
 *   보고 싶을 수 있기 때문이다. 그래서 표시 방식을 나눈다.
 */

import { MBTI_TYPES, isMbtiType, type MbtiType } from '../../data/mbti';
import styles from './MbtiSelector.module.css';

interface Props {
  selected: MbtiType | null;
  /** 같은 유형을 다시 고르면 해제된다 — 되돌릴 길이 항상 있어야 한다. */
  onSelect: (mbti: MbtiType | null) => void;
  /** 지금 고른 유형과 가까운 은하 수. 무엇이 일어났는지 알려 준다. */
  matchCount: number;
  /**
   * 로그인한 사용자가 가입할 때 남긴 유형.
   * 비로그인이거나 남기지 않았으면 비운다 — 그때는 아무것도 빛나지 않는다.
   */
  ownMbti?: string | null;
}

export function MbtiSelector({ selected, onSelect, matchCount, ownMbti }: Props) {
  // 서버가 준 문자열이 16유형 중 하나라는 보장은 없다. 아니면 없는 것으로 친다.
  const own = ownMbti && isMbtiType(ownMbti) ? ownMbti : null;

  return (
    <div className={styles.root}>
      <p className={styles.caption} id="mbti-caption">
        MBTI 선택
      </p>

      {/*
        data-guide 는 목록에만 붙인다.
        바깥(root)에 붙이면 제목과 상태 문구까지 강조 범위에 들어가 링이
        필요 이상으로 커지고, root 는 포인터를 통과시키므로 튜토리얼이
        뚫어 준 구멍과 실제로 누를 수 있는 자리가 어긋난다.
      */}
      <ul className={styles.list} aria-labelledby="mbti-caption" data-guide="mbti">
        {MBTI_TYPES.map((type) => {
          const active = type === selected;
          const mine = type === own;
          return (
            <li key={type}>
              <button
                type="button"
                className={`${styles.type} ${mine ? styles.own : ''}`}
                aria-pressed={active}
                onClick={() => onSelect(active ? null : type)}
              >
                {type}
                {/*
                  빛만으로는 스크린리더에 아무것도 전달되지 않는다.
                  내 유형이라는 사실을 이름에 붙여 글자로도 남긴다.
                */}
                {mine && <span className={styles.srOnly}> (내 유형)</span>}
                {/* 밑줄은 글자 폭만큼만 그어지도록 별도 요소로 둔다 */}
                <span className={styles.rule} aria-hidden="true" />
                {/* 내 유형 뒤에 스미는 빛. 글자를 덮지 않도록 뒤에 깐다. */}
                {mine && <span className={styles.halo} aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        고른 뒤에 무슨 일이 일어났는지 한 줄로 알려 준다.
        화면이 어두워지기만 하고 설명이 없으면 고장으로 읽힌다.
      */}
      <p className={styles.status} role="status">
        {selected ? `결이 가까운 은하 ${matchCount}곳` : '마음이 통하는 상담을 시작해보세요'}
      </p>
    </div>
  );
}
