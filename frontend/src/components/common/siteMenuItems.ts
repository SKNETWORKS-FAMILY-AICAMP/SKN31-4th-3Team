/*
 * components/common/siteMenuItems.ts
 * ───────────────────────────────────────────────────────────────────────
 * 전역 메뉴에 들어가는 항목.
 *
 * 컴포넌트와 분리해 둔 이유는 두 가지다.
 *  - 테스트가 화면을 띄우지 않고도 구성을 확인할 수 있다.
 *  - Fast Refresh 는 컴포넌트만 내보내는 파일에서 동작한다.
 */

import { PATHS } from '../../routes/paths';

export interface MenuItem {
  id: string;
  label: string;
  /** 한 줄 설명. 이름만으로 무엇인지 부족할 때 쓴다. */
  hint: string;
  /**
   * 갈 곳. 없으면 아직 만들지 않은 자리다.
   *
   * ★ 준비 중인 항목을 "눌리는 버튼"으로 만들지 않는다.
   *   눌러도 아무 일이 없는 버튼은 고장으로 읽힌다. 자리는 보여 주되
   *   누를 수 없다는 것이 생김새로 드러나야 한다.
   */
  to?: string;
}

export const MENU_ITEMS: readonly MenuItem[] = [
  { id: 'home', label: 'HOME', hint: '고민을 나누고 구절을 찾습니다', to: PATHS.home },
  { id: 'sky', label: '별자리', hint: '702개 구절을 직접 둘러봅니다', to: PATHS.sky },
  { id: 'settings', label: '환경설정', hint: '화면과 움직임을 조절합니다', to: PATHS.settings },
];
