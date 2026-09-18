import {
  BookOpen,
  Clock3,
  NotebookPen,
  CassetteTape,
  Paperclip,
  Copy,
  Bookmark,
} from 'lucide-react';
const relics = {
  'grand-design': NotebookPen,
  'borrowed-time': Clock3,
  'iron-agenda': BookOpen,
  tape: CassetteTape,
  binding: Paperclip,
  carbon: Copy,
  bookmark: Bookmark,
};
export function ReplayRelicArt({ id }: { id: string }) {
  const Icon = relics[id as keyof typeof relics] ?? Bookmark;
  return (
    <Icon
      data-relic-art={id}
      size={32}
      strokeWidth={1.6}
      color="#466dcc"
      aria-hidden="true"
    />
  );
}
