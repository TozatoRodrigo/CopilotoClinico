'use client';

import Link from 'next/link';
import { ChatsCircle } from '@phosphor-icons/react';
import { useMentoringEnabled, useMentoringNotifications } from '@/lib/mentoring-queries';
import { Callout } from '@/components/ui/callout';

/**
 * CC-707 — o aviso no app de que um médico da equipe respondeu. Some quando o
 * médico abre o caso (a resposta é marcada como lida lá). Sem push: o app
 * ainda não tem notificação do sistema.
 */
export function MentoringAnswerNotice() {
  const config = useMentoringEnabled();
  const notifications = useMentoringNotifications(config !== null);
  const unread = notifications.data?.unreadAnswers ?? [];

  if (!config || unread.length === 0) return null;

  return (
    <Callout
      tone="blue"
      icon={<ChatsCircle weight="fill" />}
      title={
        unread.length === 1
          ? 'Um médico da equipe respondeu ao seu caso'
          : `Médicos da equipe responderam a ${unread.length} casos seus`
      }
    >
      <ul className="flex flex-col gap-1">
        {unread.map((item) => (
          <li key={item.requestId}>
            <Link
              href={`/encounters/${item.encounterId}`}
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              {item.caseTitle ?? 'Ver o caso'}
            </Link>
            {item.mentorName && <span> · {item.mentorName}</span>}
          </li>
        ))}
      </ul>
    </Callout>
  );
}
