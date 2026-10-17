// Accepted payment methods. Shared by the API and the till UI so they can't drift.

export const METHODS = ["cash", "card", "mpay", "boc", "wechat", "alipay"] as const;

export type Method = (typeof METHODS)[number];

export const isMethod = (value: unknown): value is Method =>
  typeof value === "string" && (METHODS as readonly string[]).includes(value);
