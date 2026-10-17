/** Collapses whitespace and trims, so "  dirk   van der merwe " → "dirk van der merwe". */
export function normalizeDisplayName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Requires a first name and a surname of at least 2 letters each. */
export function isValidFullName(name: string): boolean {
  const parts = normalizeDisplayName(name).split(' ');
  return parts.length >= 2 && parts[0].length >= 2 && parts[parts.length - 1].length >= 2 && name.length <= 60;
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function initials(name: string): string {
  const parts = normalizeDisplayName(name).split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' }) +
    ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Builds a CSV string, quoting every cell and neutralising spreadsheet formulas. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let value = cell === null || cell === undefined ? '' : String(cell);
          if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
          return '"' + value.replace(/"/g, '""') + '"';
        })
        .join(',')
    )
    .join('\r\n');
}

export function downloadText(filename: string, content: string, type = 'text/csv;charset=utf-8'): void {
  downloadBlob(filename, new Blob(['\ufeff' + content], { type }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
