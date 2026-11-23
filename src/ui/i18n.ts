// UI strings in Japanese, Chinese and English. Macau writes Traditional Chinese, not Simplified.
// Menu names live in the services table (name_ja, name_zh, name_en), not here.

export const LANGS = ["ja", "zh", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** Language switch labels, each in its own language. */
export const LANG_LABEL: Record<Lang, string> = { ja: "日本語", zh: "繁體", en: "EN" };

type Dict = Record<Lang, string>;

/**
 * All UI strings. A test checks every key has all three languages, since a
 * missing translation renders as a blank rather than an error.
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
  summaryBooked: { ja: "予約 {n}件", zh: "預約 {n} 個", en: "{n} booked" },
  summaryInChair: { ja: "来店中 {n}名", zh: "店內 {n} 位", en: "{n} in the chair" },
  summaryAhead: { ja: "これから {n}件", zh: "稍後 {n} 個", en: "{n} still to come" },
  now: { ja: "現在", zh: "現在", en: "Now" },
  bookAt: { ja: "{time} に予約を取る", zh: "在 {time} 新增預約", en: "New booking at {time}" },
  loading: { ja: "読み込み中…", zh: "載入中…", en: "Loading…" },
  dayFailed: {
    ja: "この日の予約を読み込めませんでした。",
    zh: "無法載入這天的預約。",
    en: "Could not load this day.",
  },
  nothingBooked: {
    ja: "この日に予約はありません。",
    zh: "這天沒有預約。",
    en: "Nothing booked on this day.",
  },
  sampleIs: {
    ja: "サンプルデータは {from} 〜 {to} の期間です。",
    zh: "範例資料在 {from} 至 {to}。",
    en: "The sample week runs {from} to {to}.",
  },
  noSchedule: {
    ja: "この日は予定がありません。",
    zh: "這天沒有安排。",
    en: "Nothing on this day.",
  },

  // The room
  room: { ja: "店内", zh: "店內", en: "The room" },
  styling: { ja: "セット面", zh: "剪髮位", en: "Styling chairs" },
  shampoo: { ja: "シャンプー台", zh: "洗頭位", en: "Shampoo stations" },
  unassigned: { ja: "未定", zh: "未定", en: "Unassigned" },
  busiestAt: { ja: "ピーク {at}", zh: "{at} 最繁忙", en: "busiest at {at}" },
  full: { ja: "満席", zh: "已滿", en: "Full" },
  // Why the two seat kinds are counted apart: see DESIGN.md.
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

  // Closed days
  closedDay: { ja: "定休日", zh: "休息日", en: "Closed" },
  closure: { ja: "臨時休業", zh: "臨時休息", en: "Closed today" },
  // A whole sentence, not a fragment appended to another label.
  bookedAnyway: { ja: "予約が入っています。", zh: "仍有預約。", en: "There are bookings." },

  // Taking a booking
  bookOn: { ja: "{date} に予約を取る", zh: "為 {date} 新增預約", en: "New booking on {date}" },
  close: { ja: "閉じる", zh: "關閉", en: "Close" },
  startsAt: { ja: "開始", zh: "開始", en: "Starts" },
  withWhom: { ja: "担当", zh: "髮型師", en: "Stylist" },
  guest: { ja: "お客様", zh: "客戶", en: "Guest" },
  noGuest: { ja: "未登録", zh: "未登記", en: "Not registered" },
  guestSearchHint: {
    ja: "名前・読み・電話番号で検索（空欄なら未登録）",
    zh: "以姓名、拼音或電話搜尋（留空即未登記）",
    en: "Search by name, spelling or phone (blank = not registered)",
  },
  changeGuest: { ja: "変更", zh: "更改", en: "Change" },
  moreMatches: {
    ja: "ほか {n} 件。続けて入力してください",
    zh: "另有 {n} 位，請繼續輸入",
    en: "{n} more — keep typing",
  },
  menu: { ja: "メニュー", zh: "服務", en: "Menu" },
  totalMinutes: { ja: "合計 {n} 分", zh: "共 {n} 分鐘", en: "{n} min total" },
  minutes: { ja: "{n}分", zh: "{n}分", en: "{n}m" },
  // Guest asked for this stylist by name (affects commission).
  nominated: { ja: "指名", zh: "指定髮型師", en: "Requested by name" },
  note: { ja: "メモ", zh: "備註", en: "Note" },
  cancel: { ja: "やめる", zh: "取消", en: "Cancel" },
  submit: { ja: "予約を入れる", zh: "確認預約", en: "Book it" },
  pickMenuFirst: {
    ja: "メニューを1つ以上選んでください",
    zh: "請選擇至少一項服務",
    en: "Choose at least one service",
  },
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
  reschedule: {
    ja: "時間・担当を変える",
    zh: "更改時間或髮型師",
    en: "Change the time or stylist",
  },
  applyChange: { ja: "変更する", zh: "套用變更", en: "Apply" },

  // Booking history
  history: { ja: "変更の記録", zh: "更改記錄", en: "What has happened" },
  movedTimes: {
    ja: "この予約は {n} 回変更されています",
    zh: "這個預約已更改 {n} 次",
    en: "Moved {n} times",
  },
  // Not 予約済み or 予約完了: those are status names, so the log would read
  // "予約済み" then "予約済み → 完了". Same for "Booked" in English.
  "event.created": { ja: "予約を登録", zh: "建立預約", en: "Created" },
  "event.status": { ja: "{before} → {after}", zh: "{before} → {after}", en: "{before} → {after}" },
  "event.moved": {
    ja: "{before} から {after} へ変更",
    zh: "由 {before} 改為 {after}",
    en: "Moved from {before} to {after}",
  },
  "event.restaffed": {
    ja: "担当を {before} から {after} へ変更",
    zh: "髮型師由 {before} 改為 {after}",
    en: "Stylist changed from {before} to {after}",
  },
  "event.edited": { ja: "内容を変更", zh: "內容已更改", en: "Edited" },

  // Price grades. Separate from role: a promotion doesn't change permissions.
  "grade.owner": { ja: "オーナー", zh: "店主", en: "Owner" },
  "grade.stylist1": { ja: "スタイリスト①", zh: "髮型師 I", en: "Stylist I" },
  "grade.stylist2": { ja: "スタイリスト②", zh: "髮型師 II", en: "Stylist II" },
  "grade.assistant": { ja: "アシスタント", zh: "助理", en: "Assistant" },
  from: { ja: "{n} 〜", zh: "{n} 起", en: "from {n}" },

  // Signing in
  signIn: { ja: "サインイン", zh: "登入", en: "Sign in" },
  signOut: { ja: "サインアウト", zh: "登出", en: "Sign out" },
  loginId: { ja: "ID", zh: "帳號", en: "ID" },
  password: { ja: "パスワード", zh: "密碼", en: "Password" },
  demoCredentials: {
    ja: "デモ用のIDとパスワードを入れてあります（{loginId} / {password}）。そのままサインインしてください。",
    zh: "已填入示範用的帳號與密碼（{loginId} / {password}），直接登入即可。",
    en: "The demo's ID and password are filled in ({loginId} / {password}). Just sign in.",
  },
  ownerOnly: {
    ja: "この画面はオーナーだけが見られます。",
    zh: "此頁面只有店主可以查看。",
    en: "This screen is the owner's.",
  },

  // Customers
  navDay: { ja: "予約", zh: "預約", en: "Bookings" },
  navPeople: { ja: "お客様", zh: "客戶", en: "Customers" },
  search: { ja: "検索", zh: "搜尋", en: "Search" },
  searchHint: { ja: "名前・読み・電話番号", zh: "姓名、拼音或電話", en: "Name, spelling or phone" },
  noneFound: { ja: "見つかりません。", zh: "沒有符合的客戶。", en: "Nobody found." },
  pickSomeone: {
    ja: "お客様を選ぶと、来店履歴とカルテが表示されます。",
    zh: "選擇客戶即可查看到店紀錄和服務紀錄。",
    en: "Pick a guest to see their visits and records.",
  },
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
  newCustomer: { ja: "新規登録", zh: "新增客戶", en: "New customer" },
  editCustomer: { ja: "編集", zh: "編輯", en: "Edit" },
  customerName: { ja: "お名前", zh: "姓名", en: "Name" },
  searchKeyLabel: { ja: "読み・ローマ字", zh: "拼音／英文名", en: "Other spelling" },
  searchKeyHint: {
    ja: "検索用。漢字以外の書き方",
    zh: "用於搜尋",
    en: "For searching, e.g. a reading",
  },
  address: { ja: "住所", zh: "地址", en: "Address" },
  firstVisit: { ja: "初来店日", zh: "首次到店", en: "First visit" },
  birthday: { ja: "誕生日", zh: "生日", en: "Birthday" },
  birthdayThisMonth: { ja: "今月誕生日", zh: "本月生日", en: "Birthday this month" },
  saveCustomer: { ja: "保存", zh: "儲存", en: "Save" },
  customerSaved: { ja: "保存しました。", zh: "已儲存。", en: "Saved." },
  samePhone: {
    ja: "同じ電話番号のお客様がいます：{names}",
    zh: "已有客戶使用相同電話：{names}",
    en: "Somebody else has this phone number: {names}",
  },

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
  noTakings: {
    ja: "この月の会計はまだありません。",
    zh: "這個月還沒有帳單。",
    en: "Nothing taken this month yet.",
  },
  // The reasoning is in src/db/credit.ts.
  takingsNote: {
    ja: "売上は担当したスタイリストに付きます（シャンプーのみの来店はアシスタント）。",
    zh: "營業額歸於負責的髮型師（只洗頭的客人歸於助理）。",
    en: "Takings belong to the stylist (a wash on its own, to the assistant).",
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
  noClosures: {
    ja: "今後の臨時休業はありません。",
    zh: "之後沒有臨時休息。",
    en: "Nothing closed ahead.",
  },
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
  markLeftAsk: {
    ja: "{name}さんを {date} 付けで退職にしますか？",
    zh: "將 {name} 由 {date} 起設為離職？",
    en: "Mark {name} as left from {date}?",
  },
  bringBack: { ja: "在籍に戻す", zh: "恢復在職", en: "Bring back" },
  leftOn: { ja: "{date} 退職", zh: "{date} 離職", en: "left {date}" },
  staffSaved: { ja: "保存しました。", zh: "已儲存。", en: "Saved." },
  leftWithBookings: {
    ja: "退職として登録しました。この先の予約が {n} 件残っています。担当者の変更は予約画面から行ってください。",
    zh: "已設為離職。之後仍有 {n} 個預約，請在預約畫面更改負責人。",
    en: "Marked as left. {n} bookings still stand — change who takes them on the booking screen.",
  },
  // Reasoning in DESIGN.md.
  nobodyDeleted: {
    ja: "スタッフは削除できません。退職は日付で記録します。",
    zh: "員工不能刪除，離職以日期記錄。",
    en: "Nobody is deleted. Leaving is recorded as a date.",
  },

  // The demo
  demoOn: { ja: "デモ", zh: "示範", en: "Demo" },
  demoLoading: { ja: "デモを読み込み中…", zh: "正在載入示範…", en: "Loading the demo…" },
  demoFailed: {
    ja: "デモを読み込めませんでした。",
    zh: "無法載入示範。",
    en: "The demo did not load.",
  },
  themeDark: { ja: "暗い表示にする", zh: "切換為深色", en: "Switch to dark" },
  themeLight: { ja: "明るい表示にする", zh: "切換為淺色", en: "Switch to light" },
  demoBadge: { ja: "デモ", zh: "示範", en: "Demo" },
  demoBanner: {
    ja: "このブラウザの中だけで動いています。再読み込みすると元に戻ります。",
    zh: "只在這個瀏覽器中執行，重新整理即會復原。",
    en: "Running in this browser only. A reload puts it back.",
  },
  demoLeave: { ja: "デモを終了", zh: "結束示範", en: "Leave the demo" },
  demoOpen: { ja: "デモを開く", zh: "開啟示範", en: "Open the demo" },
  demoTrail: { ja: "デモの経過", zh: "示範的過程", en: "What the demo did" },
  demoInvite: {
    ja: "架空の美容室の5週間分のデータで、予約から会計・売上まで操作できます。",
    zh: "以一間虛構髮型屋五週的資料，從預約到收款、營收都能操作。",
    en: "Five weeks of an invented salon, from bookings to the till and the takings.",
  },
  demoInBrowser: {
    ja: "ブラウザの中だけで動きます。登録は要りません。",
    zh: "只在瀏覽器中執行，無需註冊。",
    en: "Runs in your browser. No sign-up.",
  },
  shopSignIn: { ja: "店の方のサインイン", zh: "店家登入", en: "Shop sign-in" },
  shopSignInNote: {
    ja: "店で使っている人のための入口です。このデモ用の公開サイトには、入れるアカウントはありません。",
    zh: "這是給店內人員使用的入口。此公開示範網站沒有可登入的帳號。",
    en: "For the people who work in the shop. This public demo has no account that opens it.",
  },

  // Rule verdicts. The server also sends an English message as a fallback.
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

  // API errors, keyed by the server's error code.
  "error.signed-out": { ja: "サインインしてください。", zh: "請先登入。", en: "Please sign in." },
  "error.forbidden": {
    ja: "この操作は許可されていません。",
    zh: "您沒有執行此操作的權限。",
    en: "You are not allowed to do that.",
  },
  "error.booking-not-found": {
    ja: "その予約は見つかりません。",
    zh: "找不到該預約。",
    en: "That booking was not found.",
  },
  "error.customer-not-found": {
    ja: "そのお客様は見つかりません。",
    zh: "找不到該客人。",
    en: "That customer was not found.",
  },
  "error.unreadable-body": {
    ja: "本文が読み取れません。",
    zh: "無法讀取請求內容。",
    en: "The request body could not be read.",
  },
  "error.no-booking": {
    ja: "予約が指定されていません。",
    zh: "未指定預約。",
    en: "No booking was given.",
  },
  "error.bad-amount": {
    ja: "金額が不正です。",
    zh: "金額不正確。",
    en: "The amount is not valid.",
  },
  "error.amount-too-large": {
    ja: "金額が大きすぎます。",
    zh: "金額過大。",
    en: "The amount is too large.",
  },
  "error.bad-method": {
    ja: "その支払方法は使えません。",
    zh: "不接受該付款方式。",
    en: "That payment method is not accepted.",
  },
  "error.bad-currency": {
    ja: "その通貨は扱っていません。",
    zh: "不接受該貨幣。",
    en: "That currency is not accepted.",
  },
  "error.booking-cancelled": {
    ja: "取り消された予約には会計できません。",
    zh: "已取消的預約無法收款。",
    en: "A cancelled booking cannot be paid.",
  },
  "error.bad-date": {
    ja: "日付は YYYY-MM-DD で送ってください。",
    zh: "日期請以 YYYY-MM-DD 格式傳送。",
    en: "Send the date as YYYY-MM-DD.",
  },
  "error.name-required": { ja: "名前を入れてください。", zh: "請輸入名稱。", en: "Enter a name." },
  "error.create-failed": {
    ja: "登録できませんでした。",
    zh: "無法登記。",
    en: "It could not be saved.",
  },
  "error.no-customer": {
    ja: "お客様が指定されていません。",
    zh: "未指定客人。",
    en: "No customer was given.",
  },
  "error.empty-record": { ja: "内容が空です。", zh: "內容是空的。", en: "The record is empty." },
  "error.not-configured": {
    ja: "サーバの設定が未完了です。",
    zh: "伺服器尚未完成設定。",
    en: "The server is not set up yet.",
  },
  "error.too-many-attempts": {
    ja: "試行が多すぎます。しばらく待ってください。",
    zh: "嘗試次數過多，請稍後再試。",
    en: "Too many attempts. Wait a while and try again.",
  },
  "error.wrong-credentials": {
    ja: "IDかパスワードが違います。",
    zh: "帳號或密碼錯誤。",
    en: "The ID or password is wrong.",
  },
  "error.staff-not-found": {
    ja: "その職員は見つかりません。",
    zh: "找不到該員工。",
    en: "That staff member was not found.",
  },
  "error.hours-need-seven-days": {
    ja: "7日分をまとめて送ってください。",
    zh: "請一次傳送七天的資料。",
    en: "Send all seven days together.",
  },
  "error.bad-weekday": {
    ja: "曜日が不正です。",
    zh: "星期不正確。",
    en: "The day of the week is not valid.",
  },
  "error.bad-opening-time": {
    ja: "開店時刻の形式が違います。",
    zh: "開店時間格式不正確。",
    en: "The opening time is not in HH:MM form.",
  },
  "error.bad-closing-time": {
    ja: "閉店時刻の形式が違います。",
    zh: "關店時間格式不正確。",
    en: "The closing time is not in HH:MM form.",
  },
  "error.closes-before-opens": {
    ja: "閉店が開店より前になっています。",
    zh: "關店時間早於開店時間。",
    en: "Closing is before opening.",
  },
  "error.duplicate-weekday": {
    ja: "曜日が重複しています。",
    zh: "星期重複。",
    en: "A day of the week appears twice.",
  },
  "error.bad-role": { ja: "役割が不正です。", zh: "職位不正確。", en: "The role is not valid." },
  "error.bad-start-time": {
    ja: "開始時刻の形式が違います。",
    zh: "開始時間格式不正確。",
    en: "The start time is not in HH:MM form.",
  },
  "error.no-services": {
    ja: "施術を1つ以上選んでください。",
    zh: "請至少選擇一項服務。",
    en: "Choose at least one treatment.",
  },
  "error.too-many-services": {
    ja: "1件の予約に入れられる施術は8つまでです。",
    zh: "每個預約最多只能有八項服務。",
    en: "A booking can hold at most eight treatments.",
  },
  "error.unknown-service": {
    ja: "メニューにない施術が含まれています。",
    zh: "包含不在服務項目中的服務。",
    en: "A treatment is not on the menu.",
  },
  "error.crosses-midnight": {
    ja: "その開始時刻だと日付をまたぎます。",
    zh: "以這個開始時間會跨過午夜。",
    en: "Starting then, it would run past midnight.",
  },
  "error.bad-status": {
    ja: "その状態は使えません。",
    zh: "該狀態無法使用。",
    en: "That status is not valid.",
  },
  "error.not-json": {
    ja: "送信の形式が正しくありません。",
    zh: "提交格式不正確。",
    en: "Send the request body as JSON.",
  },
  "error.unknown-customer": {
    ja: "そのお客様は登録されていません。",
    zh: "沒有該客人的記錄。",
    en: "That guest is not on file.",
  },
  "error.unknown-staff": {
    ja: "その日に在籍していないスタッフです。",
    zh: "該員工當日不在職。",
    en: "That stylist is not on the team on that date.",
  },
  "error.last-owner": {
    ja: "オーナーが一人もいなくなります。先に別の人をオーナーにしてください。",
    zh: "這樣就沒有店主了。請先把另一位設為店主。",
    en: "Somebody else has to be an owner first.",
  },
  "error.bad-grade": {
    ja: "その等級は使えません。",
    zh: "該級別無法使用。",
    en: "The grade is not valid.",
  },
  "error.bad-color": {
    ja: "色の指定が正しくありません。",
    zh: "顏色格式不正確。",
    en: "The colour is not a #RRGGBB value.",
  },
  "error.left-before-joined": {
    ja: "退職日が入社日より前になっています。",
    zh: "離職日期早於入職日期。",
    en: "The leaving date is before the joining date.",
  },
  "error.booking-not-theirs": {
    ja: "その予約はこのお客様のものではありません。",
    zh: "該預約不屬於這位客人。",
    en: "That booking is not this guest's.",
  },
  "error.bad-request-key": {
    ja: "送信の識別子が正しくありません。",
    zh: "提交識別碼不正確。",
    en: "The request key is not valid.",
  },
} satisfies Record<string, Dict>;

export type Key = keyof typeof TEXT;

/** Short weekday names, Sunday first. */
const WEEKDAYS: Record<Lang, string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["日", "一", "二", "三", "四", "五", "六"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export const weekday = (lang: Lang, n: number): string => WEEKDAYS[lang][n] ?? "";

/**
 * Look up a string and fill its {placeholders}. Unfilled placeholders are left
 * as is so a missing value is visible on screen.
 */
export function say(lang: Lang, key: Key, values: Record<string, string | number> = {}): string {
  const template = TEXT[key][lang];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** Service name in `lang`, falling back to Japanese (the only required name). */
export function serviceName(
  lang: Lang,
  service: { nameJa: string; nameZh: string | null; nameEn: string | null },
): string {
  if (lang === "zh") return service.nameZh ?? service.nameJa;
  if (lang === "en") return service.nameEn ?? service.nameJa;
  return service.nameJa;
}

/** Localized verdict. Unknown codes fall back to the server's English message. */
export function verdictText(
  lang: Lang,
  verdict: { code: string; message: string; data?: Record<string, string | number> },
): string {
  const key = `verdict.${verdict.code}` as Key;
  if (!(key in TEXT)) return verdict.message;
  return say(lang, key, verdict.data ?? {});
}

/**
 * Localized error message. Falls back to the server's message, then to the
 * HTTP status (e.g. a proxy error page).
 */
export function errorText(lang: Lang, reply: unknown, status: number): string {
  const { code, error } = (reply ?? {}) as { code?: unknown; error?: unknown };
  const key = `error.${String(code)}` as Key;
  if (typeof code === "string" && key in TEXT) return say(lang, key);
  if (typeof error === "string") return error;
  return `HTTP ${status}`;
}
