/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        /*
         * 배열 형태로 'react-dom' 만 적으면 react-dom/client 같은 하위 진입점이
         * 잡히지 않아 앱 청크로 샌다. 경로로 판정해 확실히 갈라 놓는다.
         * 벤더는 앱 코드보다 훨씬 덜 바뀌므로 따로 두면 캐시 적중률이 올라간다.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router') || id.includes('/@remix-run/')) return 'router';
          if (id.includes('react-dom') || id.includes('/scheduler/') || id.includes('/react/')) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
  test: {
    /*
     * 기본 풀(forks)은 테스트가 모두 통과한 뒤에도 워커 정리가 끝나지 않아
     * 실행이 멈추는 경우가 있다. threads 는 같은 결과를 내면서 안정적이다.
     */
    pool: 'threads',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],

    /*
     * ★ 테스트는 언제나 mock 으로 돈다.
     *
     * VITE_API_BASE_URL 이 있으면 앱은 실제 Django 를 부르러 간다.
     * 개발자가 .env.local 에 그 값을 넣는 순간(= 백엔드를 붙이는 순간)
     * 테스트가 네트워크를 때리기 시작하고, 로그인 벽이 세워져 화면이
     * 뜨지 않는다. 실제로 여기서 19개가 한 번에 깨졌다.
     *
     * "테스트 돌리기 전에 .env.local 을 지우세요" 는 규칙이 아니라 함정이다.
     * 커밋되는 파일에 못박아 두면 각자의 환경이 무엇이든 결과가 같다.
     */
    env: { VITE_API_BASE_URL: '' },
  },
});
