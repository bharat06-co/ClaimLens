export function dateText(value: string | Date | null | undefined) {
  if(!value) return '—';
  return new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
}
export function statusLabel(value: string) { return value.replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase()); }
