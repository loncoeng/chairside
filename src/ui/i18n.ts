// Three languages, because the shop works in three.
//
// Japanese for the owner, Traditional Chinese for most of the guests and the
// local staff, English for everyone else. Macau writes Traditional, not
// Simplified, and getting that wrong is the kind of detail people notice
// immediately.
//
// Menu names are not in here. Those are rows the shop types in — services has
// name_ja, name_zh and name_en — and a dictionary in the code could not hold
// a service invented after it shipped.

export const LANGS = ["ja", "zh", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** What the switch in the corner says. Each in its own language. */
export const LANG_LABEL: Record<Lang, string> = { ja: "日本語", zh: "繁體", en: "EN" };

type Dict = Record<Lang, string>;

/**
 * Every string the interface says.
 *
 * Flat, and with the same keys in all three — a test checks that, because a
 * missing translation shows up as a blank on screen rather than an error, and
 * nobody reviewing a pull request reads three columns for the gap.
 */
export const TEXT = {
  tagline: {
    ja: "美容室の予約・顧客管理",
    zh: "為一間髮型屋而設的預約與客戶管理",
    en: "Booking and customer records for one hair salon",
  },

  // The day
  prevDay: { ja: "前の日", zh: "前一天", en: "Previous day" },
  nextDay: { ja: "次の日", zh: "後一天", en: "Next day" },
  today: { ja: "今日", zh: "今天", en: "Today" },
  takeBooking: { ja: "予約を取る", zh: "新增預約", en: "New booking" },
  loading: { ja: "読み込み中…", zh: "載入中…", en: "Loading…" },
  dayFailed: {
    ja: "この日の予約を読み込めませんでした。",
    zh: "無法載入這天的預約。",
    en: "Could not load this day.",
  },
  nothingBooked: { ja: "この日に予約はありません。", zh: "這天沒有預約。", en: "Nothing booked on this day." },
  sampleIs: { ja: "サンプルデータは {from} 〜 {to} の期間です。", zh: "範例資料在 {from} 至 {to}。", en: "The sample week runs {from} to {to}." },
  noSchedule: { ja: "この日は予定がありません。", zh: "這天沒有安排。", en: "Nothing on this day." },

  // The room
  room: { ja: "店内", zh: "店內", en: "The room" },
  styling: { ja: "セット面", zh: "剪髮位", en: "Styling chairs" },
  shampoo: { ja: "シャンプー台", zh: "洗頭位", en: "Shampoo stations" },
  unassigned: { ja: "未定", zh: "未定", en: "Unassigned" },
  busiestAt: { ja: "ピークは {at}", zh: "{at} 最繁忙", en: "busiest at {at}" },
  full: { ja: "満席", zh: "已滿", en: "Full" },
  // The counts, and nothing else. Why the two kinds of seat are counted
  // apart is an argument, and an argument belongs in DESIGN.md — the screen
  // repeating it wrapped onto three lines and said nothing the numbers had
  // not already said.
  roomSummary: {
    ja: "セット面 {styling} 台、シャンプー台 {shampoo} 台、在籍 {staff} 名",
    zh: "剪髮位 {styling} 個、洗頭位 {shampoo} 個、在職 {staff} 人",
    en: "{styling} styling chairs, {shampoo} shampoo stations, {staff} on the team",
  },
  roomFailed: {
    ja: "データベースが応答しませんでした。",
    zh: "資料庫沒有回應。",
    en: "The database did not answer.",
  },

  // Roles
  owner: { ja: "オーナー", zh: "店主", en: "owner" },
  stylist: { ja: "スタイリスト", zh: "髮型師", en: "stylist" },
  assistant: { ja: "アシスタント", zh: "助理", en: "assistant" },

  // Days that are not ordinary
  closedDay: { ja: "定休日", zh: "休息日", en: "Closed" },
  closure: { ja: "臨時休業", zh: "臨時休息", en: "Closed today" },
  butBooked: { ja: "ですが、予約が入っています。", zh: "，但仍有預約。", en: " — but there are bookings." },
  fullStop: { ja: "です。", zh: "。", en: "." },

  // Taking a booking
  bookOn: { ja: "{date} に予約を取る", zh: "為 {date} 新增預約", en: "New booking on {date}" },
  close: { ja: "閉じる", zh: "關閉", en: "Close" },
  startsAt: { ja: "開始", zh: "開始", en: "Starts" },
  withWhom: { ja: "担当", zh: "髮型師", en: "Stylist" },
  guest: { ja: "お客様", zh: "客戶", en: "Guest" },
  noGuest: { ja: "未登録", zh: "未登記", en: "Not registered" },
  menu: { ja: "メニュー", zh: "服務", en: "Menu" },
  totalMinutes: { ja: "合計 {n} 分", zh: "共 {n} 分鐘", en: "{n} min total" },
  minutes: { ja: "{n}分", zh: "{n}分", en: "{n}m" },
  // A guest who asked for that stylist by name. It is on the calendar as a
  // star, in the takings as a share, and in a real salon it decides
  // commission — so it is worth a word rather than a symbol.
  nominated: { ja: "指名", zh: "指定髮型師", en: "Requested by name" },
  note: { ja: "メモ", zh: "備註", en: "Note" },
  cancel: { ja: "やめる", zh: "取消", en: "Cancel" },
  submit: { ja: "予約を入れる", zh: "確認預約", en: "Book it" },
  submitAnyway: { ja: "確認のうえ入れる", zh: "已確認，仍然預約", en: "Book it anyway" },
  sending: { ja: "送信中…", zh: "傳送中…", en: "Sending…" },
  tagStop: { ja: "不可", zh: "不可", en: "No" },
  tagWarn: { ja: "確認", zh: "請確認", en: "Check" },

  // An existing booking
  bookingDetail: { ja: "予約の内容", zh: "預約內容", en: "This booking" },
  status: { ja: "状態", zh: "狀態", en: "Status" },
  markBooked: { ja: "予約済み", zh: "已預約", en: "Booked" },
  markArrived: { ja: "来店", zh: "已到店", en: "Arrived" },
  markDone: { ja: "完了", zh: "已完成", en: "Done" },
  markCancelled: { ja: "キャンセル", zh: "已取消", en: "Cancelled" },
  markNoShow: { ja: "無断キャンセル", zh: "爽約", en: "No-show" },
  reschedule: { ja: "時間・担当を変える", zh: "更改時間或髮型師", en: "Change the time or stylist" },
  applyChange: { ja: "変更する", zh: "套用變更", en: "Apply" },

  // What happened to this booking
  history: { ja: "変更の記録", zh: "更改記錄", en: "What has happened" },
  movedTimes: { ja: "この予約は {n} 回変更されています", zh: "這個預約已更改 {n} 次", en: "Moved {n} times" },
  "event.created": { ja: "予約を取った", zh: "建立預約", en: "Booked" },
  "event.status": { ja: "{before} → {after}", zh: "{before} → {after}", en: "{before} → {after}" },
  "event.moved": { ja: "{before} から {after} へ変更", zh: "由 {before} 改為 {after}", en: "Moved from {before} to {after}" },
  "event.restaffed": { ja: "担当を {before} から {after} へ変更", zh: "髮型師由 {before} 改為 {after}", en: "Stylist changed from {before} to {after}" },
  "event.edited": { ja: "内容を変更", zh: "內容已更改", en: "Edited" },

  // The line at the bottom
  designLink: {
    ja: "設計と、作らなかったものの理由は DESIGN.md に書いてあります。",
    zh: "設計與刻意未實作的部分，寫在 DESIGN.md。",
    en: "The design, and what was left out on purpose, are in DESIGN.md.",
  },

  // What a stylist charges. Not the same as what they do — somebody can be
  // promoted without their permissions changing.
  "grade.owner": { ja: "オーナー", zh: "店主", en: "Owner" },
  "grade.stylist1": { ja: "スタイリスト①", zh: "髮型師 I", en: "Stylist I" },
  "grade.stylist2": { ja: "スタイリスト②", zh: "髮型師 II", en: "Stylist II" },
  "grade.assistant": { ja: "アシスタント", zh: "助理", en: "Assistant" },
  from: { ja: "{n} 〜", zh: "{n} 起", en: "from {n}" },

  // Customers
  navDay: { ja: "予約", zh: "預約", en: "Bookings" },
  navPeople: { ja: "お客様", zh: "客戶", en: "Customers" },
  search: { ja: "検索", zh: "搜尋", en: "Search" },
  searchHint: { ja: "名前・読み・電話番号", zh: "姓名、拼音或電話", en: "Name, spelling or phone" },
  noneFound: { ja: "見つかりません。", zh: "沒有符合的客戶。", en: "Nobody found." },
  pickSomeone: { ja: "左から選んでください。", zh: "請從左側選擇。", en: "Pick somebody from the list." },
  phone: { ja: "TEL", zh: "電話", en: "Phone" },
  visits: { ja: "来店", zh: "到店次數", en: "Visits" },
  lastVisit: { ja: "最終来店", zh: "最近到店", en: "Last visit" },
  moves: { ja: "変更", zh: "更改次數", en: "Reschedules" },
  cancelledCount: { ja: "キャンセル", zh: "取消次數", en: "Cancellations" },
  shortNotice: { ja: "直前キャンセル", zh: "臨時取消", en: "At short notice" },
  noShowCount: { ja: "無断キャンセル", zh: "爽約次數", en: "No-shows" },
  records: { ja: "カルテ", zh: "服務紀錄", en: "Treatment records" },
  pastVisits: { ja: "来店履歴", zh: "到店紀錄", en: "Past visits" },
  noVisitsYet: { ja: "まだ来店がありません。", zh: "尚未到店。", en: "No visits yet." },

  // Money
  navMoney: { ja: "売上", zh: "營業額", en: "Takings" },
  prevMonth: { ja: "前の月", zh: "上個月", en: "Previous month" },
  nextMonth: { ja: "次の月", zh: "下個月", en: "Next month" },
  takings: { ja: "売上 (MOP)", zh: "營業額 (MOP)", en: "Takings (MOP)" },
  bills: { ja: "会計", zh: "單數", en: "Bills" },
  perBill: { ja: "客単価", zh: "平均單價", en: "Per bill" },
  nominatedShare: { ja: "指名率", zh: "指定比例", en: "Requested" },
  byDay: { ja: "日別の売上", zh: "每日營業額", en: "By day" },
  average: { ja: "平均", zh: "平均", en: "Average" },
  noTakingsThatDay: { ja: "会計なし", zh: "沒有帳單", en: "nothing taken" },
  byStylist: { ja: "担当者別", zh: "髮型師別", en: "By stylist" },
  byCurrency: { ja: "通貨別（受取額）", zh: "貨幣別（收取金額）", en: "By currency (as taken)" },
  byMethod: { ja: "支払方法", zh: "付款方式", en: "By method" },
  byService: { ja: "メニュー別（件数）", zh: "服務別（次數）", en: "By service (count)" },
  noTakings: { ja: "この月の会計はまだありません。", zh: "這個月還沒有帳單。", en: "Nothing taken this month yet." },
  takingsNote: {
    ja: "会計は担当したスタイリストに付きます。シャンプーだけの来店は、担当したアシスタントに付きます。1件の会計を施術ごとに分けることはしていません。",
    zh: "帳單歸於負責的髮型師；只洗頭的客人歸於負責的助理。一張帳單不會按服務拆分。",
    en: "A bill belongs to the stylist who did the treatment; a wash on its own belongs to whoever did it. One bill is not split between its treatments.",
  },
  "method.cash": { ja: "現金", zh: "現金", en: "Cash" },
  "method.card": { ja: "カード", zh: "信用卡", en: "Card" },
  "method.wechat": { ja: "WeChat", zh: "微信支付", en: "WeChat" },
  "method.alipay": { ja: "Alipay", zh: "支付寶", en: "Alipay" },
  "method.mpay": { ja: "MPay", zh: "澳門通", en: "MPay" },
  "method.boc": { ja: "BOC Pay", zh: "中銀", en: "BOC Pay" },

  // Taking payment
  takePayment: { ja: "会計する", zh: "結帳", en: "Take payment" },
  amount: { ja: "金額", zh: "金額", en: "Amount" },
  currency: { ja: "通貨", zh: "貨幣", en: "Currency" },
  method: { ja: "支払方法", zh: "付款方式", en: "Method" },
  paid: { ja: "受取済み", zh: "已收款", en: "Paid" },
  listPrice: { ja: "定価 {n}", zh: "定價 {n}", en: "List {n}" },

  // Holidays
  "region.MO": { ja: "マカオ", zh: "澳門", en: "Macau" },
  "region.HK": { ja: "香港", zh: "香港", en: "Hong Kong" },
  "region.CN": { ja: "中国", zh: "內地", en: "Mainland" },
  holidaysUnknown: {
    ja: "{to} より先の祝日は取り込まれていません。",
    zh: "尚未匯入 {to} 之後的公眾假期。",
    en: "Holidays have not been imported past {to}.",
  },

  // The shop's settings
  navShop: { ja: "設定", zh: "設定", en: "Settings" },
  openingHours: { ja: "営業時間", zh: "營業時間", en: "Opening hours" },
  saveHours: { ja: "営業時間を保存", zh: "儲存營業時間", en: "Save hours" },
  hoursSaved: { ja: "営業時間を保存しました。", zh: "已儲存營業時間。", en: "Hours saved." },
  closures: { ja: "臨時休業", zh: "臨時休息", en: "One-off closures" },
  date: { ja: "日付", zh: "日期", en: "Date" },
  reason: { ja: "理由", zh: "原因", en: "Reason" },
  addClosure: { ja: "休みにする", zh: "設為休息", en: "Close that day" },
  reopen: { ja: "戻す", zh: "取消", en: "Open it again" },
  noClosures: { ja: "今後の臨時休業はありません。", zh: "之後沒有臨時休息。", en: "Nothing closed ahead." },
  closedSaved: { ja: "休業にしました。", zh: "已設為休息。", en: "Closed." },
  closedWithBookings: {
    ja: "臨時休業として登録しました。当日の予約 {n} 件はそのまま残っています。",
    zh: "已設為休息。當天仍有 {n} 個預約，預約沒有被刪除。",
    en: "Closed. {n} bookings still stand that day — they have not been removed.",
  },
  theTeam: { ja: "スタッフ", zh: "員工", en: "The team" },
  addPerson: { ja: "名前を追加", zh: "新增員工", en: "Add somebody" },
  role: { ja: "役割", zh: "職位", en: "Role" },
  add: { ja: "追加", zh: "新增", en: "Add" },
  markLeft: { ja: "退職にする", zh: "設為離職", en: "Mark as left" },
  bringBack: { ja: "在籍に戻す", zh: "恢復在職", en: "Bring back" },
  leftOn: { ja: "{date} 退職", zh: "{date} 離職", en: "left {date}" },
  staffSaved: { ja: "保存しました。", zh: "已儲存。", en: "Saved." },
  leftWithBookings: {
    ja: "退職として登録しました。この先の予約が {n} 件残っています。担当者の変更は予約画面から行ってください。",
    zh: "已設為離職。之後仍有 {n} 個預約，請在預約畫面更改負責人。",
    en: "Marked as left. {n} bookings still stand — change who takes them on the booking screen.",
  },
  nobodyDeleted: {
    ja: "スタッフは削除できません。削除すると過去の予約から担当者が消え、スタイリスト別の売上が合わなくなるためです。退職は日付で記録します。",
    zh: "員工不能刪除。刪除後過去的預約會失去負責人，髮型師別的營業額也會對不上。離職以日期記錄。",
    en: "Nobody is deleted. Removing somebody takes them out of bookings that already happened and stops per-stylist takings adding up; leaving is recorded as a date.",
  },

  // The demo
  demoOn: { ja: "デモ", zh: "示範", en: "Demo" },
  demoLoading: { ja: "デモを読み込み中…", zh: "正在載入示範…", en: "Loading the demo…" },
  demoFailed: { ja: "デモを読み込めませんでした。", zh: "無法載入示範。", en: "The demo did not load." },
  demoBanner: {
    ja: "デモ表示中です。データはこのブラウザ内だけに保持され、操作内容が他の人に見えることはありません。再読み込みすると元に戻ります。",
    zh: "這是示範。資料只存在於這個瀏覽器中，任何操作都不會被別人看到，重新整理即會復原。",
    en: "This is the demo. The data lives in this browser only — nothing you do is visible to anybody else, and a reload puts it back.",
  },
  demoLeave: { ja: "デモを終了", zh: "結束示範", en: "Leave the demo" },

  // What the rules say. Built here rather than on the server, which can only
  // write in one language. The server still sends its own Japanese sentence
  // as a fallback for anything not going through this screen.
  "verdict.staff-double-booked": {
    ja: "{who}は {from}–{to} に別の施術が入っています。",
    zh: "{who} 在 {from}–{to} 已有其他服務。",
    en: "{who} already has something at {from}–{to}.",
  },
  "verdict.seat-taken": {
    ja: "{seat}は {from}–{to} に使用中です。",
    zh: "{seat} 在 {from}–{to} 已被佔用。",
    en: "{seat} is in use at {from}–{to}.",
  },
  "verdict.self-overlap": {
    ja: "同じ予約の中で時間が重なっています。",
    zh: "同一個預約內的時間互相重疊。",
    en: "Two treatments in this booking overlap.",
  },
  "verdict.backwards": {
    ja: "終了時刻が開始時刻より前です（{from}→{to}）。",
    zh: "結束時間早於開始時間（{from}→{to}）。",
    en: "It ends before it starts ({from}→{to}).",
  },
  "verdict.empty": {
    ja: "施術が1つも入っていません。",
    zh: "沒有選擇任何服務。",
    en: "Nothing has been chosen.",
  },
  "verdict.closed-day": {
    ja: "定休日です。入れる場合は確認してください。",
    zh: "這天是休息日，請確認後再預約。",
    en: "The shop is closed that day. Check before taking it.",
  },
  "verdict.closure": {
    ja: "臨時休業の日です。",
    zh: "這天臨時休息。",
    en: "The shop is closed that day.",
  },
  "verdict.outside-hours": {
    ja: "営業時間外にかかります（{opensAt}–{closesAt}）。",
    zh: "超出營業時間（{opensAt}–{closesAt}）。",
    en: "This falls outside opening hours ({opensAt}–{closesAt}).",
  },
  "verdict.over-capacity-shampoo": {
    ja: "この時間はシャンプー台 {total} 台がすべて埋まっています。",
    zh: "這個時段 {total} 個洗頭位全部已滿。",
    en: "All {total} shampoo stations are taken at that time.",
  },
  "verdict.over-capacity-styling": {
    ja: "この時間はセット面 {total} 台がすべて埋まっています。",
    zh: "這個時段 {total} 個剪髮位全部已滿。",
    en: "All {total} styling chairs are taken at that time.",
  },
} satisfies Record<string, Dict>;

export type Key = keyof typeof TEXT;

/** Weekday initials, in the form each language actually uses. */
const WEEKDAYS: Record<Lang, string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["日", "一", "二", "三", "四", "五", "六"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export const weekday = (lang: Lang, n: number): string => WEEKDAYS[lang][n] ?? "";

/**
 * A string, with {placeholders} filled in.
 *
 * A placeholder with nothing to fill it is left as it is rather than blanked,
 * so a missing value looks wrong on screen instead of reading as a complete
 * sentence that happens to be untrue.
 */
export function say(lang: Lang, key: Key, values: Record<string, string | number> = {}): string {
  const template = TEXT[key][lang];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/**
 * Which name a service goes by.
 *
 * Falls back to Japanese: the shop types that one in first, and the other two
 * may simply not have been filled in yet. A blank where a service name should
 * be is worse than the wrong language.
 */
export function serviceName(
  lang: Lang,
  service: { nameJa: string; nameZh: string | null; nameEn: string | null },
): string {
  if (lang === "zh") return service.nameZh ?? service.nameJa;
  if (lang === "en") return service.nameEn ?? service.nameJa;
  return service.nameJa;
}

/**
 * What a rule said, in the reader's language.
 *
 * Falls back to the server's own sentence for a code this build does not know
 * about — an older screen against a newer API still says something true,
 * rather than nothing at all.
 */
export function verdictText(
  lang: Lang,
  verdict: { code: string; message: string; data?: Record<string, string | number> },
): string {
  const key = `verdict.${verdict.code}` as Key;
  if (!(key in TEXT)) return verdict.message;
  return say(lang, key, verdict.data ?? {});
}
