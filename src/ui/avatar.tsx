// A staff member's initial on their colour, where a name alone is hard to scan.

export function initial(name: string): string {
  const first = [...name.trim()][0] ?? "?";
  return first.toUpperCase();
}

export function Avatar({ name, color }: { name: string; color: string | null | undefined }) {
  return (
    <span class="avatar" style={{ background: color ?? "var(--ink-faint)" }} aria-hidden="true">
      {initial(name)}
    </span>
  );
}
