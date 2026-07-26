export async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export function todayShort() {
  return new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

export function nextNewTicker(stocks) {
  const existing = new Set(stocks.map((stock) => stock.ticker));
  if (!existing.has("NEW")) return "NEW";
  let index = 2;
  while (existing.has(`NEW${index}`)) index += 1;
  return `NEW${index}`;
}
