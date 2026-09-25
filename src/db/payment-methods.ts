// What the shop takes.
//
// One list. It was written out in the API and again in the till, and the two
// drifted the moment Macau's own wallets were added — the server accepted
// MPay and the dropdown never offered it.
//
// MPay and BOC Pay are the local wallets and between them cover most of
// Macau; WeChat and Alipay come over the border with the guests who use them.
// A till that only knew cash and cards would be a till nobody here could use.

export const METHODS = ["cash", "card", "mpay", "boc", "wechat", "alipay"] as const;

export type Method = (typeof METHODS)[number];

export const isMethod = (value: unknown): value is Method =>
  typeof value === "string" && (METHODS as readonly string[]).includes(value);
