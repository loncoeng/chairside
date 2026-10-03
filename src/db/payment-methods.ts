// What the shop takes, in one list. It was written out twice — in the API and
// in the till — and they drifted the day the Macau wallets were added: the
// server accepted MPay and the dropdown never offered it.

export const METHODS = ["cash", "card", "mpay", "boc", "wechat", "alipay"] as const;

export type Method = (typeof METHODS)[number];

export const isMethod = (value: unknown): value is Method =>
  typeof value === "string" && (METHODS as readonly string[]).includes(value);
