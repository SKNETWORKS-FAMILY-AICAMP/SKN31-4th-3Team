/*
 * components/counsel/CounselThread.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 대화 목록.
 *
 * 접근성:
 *  - role="log" + aria-live="polite" 로 새 메시지가 스크린리더에 전달된다
 *    (assertive 는 사용자가 타이핑 중인 것도 끊어 버린다 — polite 를 쓴다)
 *  - 자동 스크롤은 사용자가 위로 올려 읽고 있을 때는 하지 않는다
 */

import { useEffect, useRef } from 'react';
import type { CounselMessage } from '../../data/types';
import { formatRef } from '../../data/verses';
import { useVerses } from '../../state/VersesContext';
import { SafetyNotice } from '../common/SafetyNotice';
import styles from './CounselThread.module.css';

interface Props {
  messages: readonly CounselMessage[];
  pending: boolean;
  onSafetyBack: () => void;
}

/** 바닥에서 이 거리 안에 있으면 "따라 읽는 중"으로 본다. */
const STICK_THRESHOLD = 80;

export function CounselThread({ messages, pending, onSafetyBack }: Props) {
  const { byId } = useVerses();
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // 사용자가 위로 올려 이전 대화를 읽고 있으면 자동 스크롤을 멈춘다.
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  };

  useEffect(() => {
    if (!stickRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending]);

  return (
    <div
      ref={listRef}
      className={styles.thread}
      onScroll={onScroll}
      role="log"
      aria-live="polite"
      aria-label="상담 대화"
    >
      {messages.map((message) => {
        if (message.kind === 'safety') {
          return (
            <SafetyNotice
              key={message.id}
              // 대화 안에서는 닫을 것이 없다 — 이미 대화가 이어지는 중이다.
              onContinue={() => undefined}
              onBack={onSafetyBack}
            />
          );
        }

        const star = message.verseId ? byId.get(message.verseId) : undefined;
        const isUser = message.role === 'user';

        return (
          <article
            key={message.id}
            className={isUser ? styles.user : styles.guide}
            aria-label={isUser ? '내가 보낸 말' : '안내자의 말'}
          >
            <p className={styles.text}>{message.text}</p>
            {!isUser && star && (
              <p className={styles.source}>
                {formatRef(star)}
                {star.depth === 'full' && ` · ${star.attribution}`}
              </p>
            )}
          </article>
        );
      })}

      {pending && (
        <p className={styles.pending} role="status">
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          마음을 살피는 중…
        </p>
      )}
    </div>
  );
}
