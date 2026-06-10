import { ReactRenderer } from '@tiptap/react';
import { userAPI } from '../lib/api';
import MentionList, { type MentionItem, type MentionListHandle } from './MentionList';

function place(el: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  el.style.position = 'fixed';
  el.style.left = `${Math.min(rect.left, window.innerWidth - 270)}px`;
  const popH = el.offsetHeight || 220;
  const below = window.innerHeight - rect.bottom;
  el.style.top = below < popH + 8 ? `${Math.max(8, rect.top - popH - 6)}px` : `${rect.bottom + 6}px`;
}

// TipTap suggestion config for @-mentions: searches users and shows MentionList.
export const mentionSuggestion = {
  char: '@',
  items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
    const q = query.trim();
    if (!q) return [];
    try {
      const { data } = await userAPI.search({ query: q, limit: 6 });
      const list: any[] = Array.isArray(data) ? data : (data?.results || data?.users || []);
      return list
        .map((u: any) => ({
          id: u.id ?? u.user?.id,
          label: `${u.firstName ?? u.user?.firstName ?? ''} ${u.lastName ?? u.user?.lastName ?? ''}`.trim()
            || u.nickname || u.user?.nickname || 'user',
          nickname: u.nickname ?? u.user?.nickname,
          avatar: u.avatar ?? u.user?.avatar,
        }))
        .filter((u: MentionItem) => u.id);
    } catch {
      return [];
    }
  },
  render: () => {
    let component: ReactRenderer<MentionListHandle> | null = null;
    let popup: HTMLDivElement | null = null;
    return {
      onStart: (props: any) => {
        component = new ReactRenderer(MentionList, { props, editor: props.editor });
        popup = document.createElement('div');
        popup.style.zIndex = '80';
        popup.appendChild(component.element);
        document.body.appendChild(popup);
        place(popup, props.clientRect?.());
      },
      onUpdate: (props: any) => {
        component?.updateProps(props);
        if (popup) place(popup, props.clientRect?.());
      },
      onKeyDown: (props: any) => {
        if (props.event.key === 'Escape') return true;
        return component?.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        popup?.remove();
        component?.destroy();
        popup = null;
        component = null;
      },
    };
  },
};
