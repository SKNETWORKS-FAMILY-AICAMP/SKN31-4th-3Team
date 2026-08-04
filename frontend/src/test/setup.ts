import '@testing-library/jest-dom/vitest';

// jsdom 에는 matchMedia 가 없다 — reduced-motion/포인터 질의를 위해 채운다.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// jsdom 에는 ResizeObserver 가 없다 — 캔버스 레이어들이 이걸 쓴다.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

/*
 * jsdom 은 canvas 2D 컨텍스트를 구현하지 않는다.
 * 원래 구현은 호출할 때마다 "Not implemented" 를 콘솔에 뱉으므로,
 * 조용히 null 을 반환하도록 덮어쓴다.
 *
 * 컴포넌트들은 컨텍스트가 없을 때 안전하게 빠져나가도록 이미 작성돼 있으므로,
 * 이 스텁은 동시에 "캔버스 미지원 환경" 폴백 경로를 테스트하는 역할도 한다.
 */
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
