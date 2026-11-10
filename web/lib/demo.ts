/** Demo is off unless the address asks for it. `?demo=1` turns it on. `?demo=0` turns it off. */
export function demoEnabled(forced: boolean, search: string): boolean {
  const value = new URLSearchParams(search).get("demo");
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return forced;
}
