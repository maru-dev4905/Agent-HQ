import type { StatusLook } from '../../lib/status';

/** Icon + text, so the state never depends on colour alone. */
export function StatusBadge({ look }: { look: StatusLook }) {
  return (
    <span className={`badge tone-${look.tone}`}>
      <span aria-hidden="true">{look.icon}</span> {look.label}
    </span>
  );
}
