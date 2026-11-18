export type Locale = "zh-Hant" | "zh-Hans" | "ja" | "ko" | "th" | "en";

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "zh-Hant", label: "繁體中文" },
  { id: "zh-Hans", label: "简体中文" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "th", label: "ไทย" },
  { id: "en", label: "English" },
];

export const DEFAULT_LOCALE: Locale = "en";

const en = {
  "brand.tagline": "this block, for a day",
  "map.loading": "Loading the map",
  "map.zoomHint": "Zoom in to see the blocks",
  "locale.label": "Language",

  "auth.google": "Sign in with Google",
  "auth.apple": "Sign in with Apple",
  "auth.facebook": "Sign in with Facebook",
  "auth.signingIn": "Signing in",
  "auth.signedIn": "Signed in",
  "auth.signOut": "Sign out",
  "auth.notConfigured": "Sign-in isn't configured.",

  "demo.state": "Demo state",
  "demo.read": "Signed out",
  "demo.wait": "Waiting for a token",
  "demo.token": "Token arrived",
  "demo.other": "Reading another block",
  "demo.live": "Live",

  "sheet.close": "Close",
  "sheet.loading": "Loading comments",
  "sheet.empty": "Nothing here in the last 24 hours.",
  "sheet.yours": "Your block",
  "sheet.waiting": "Waiting for a token.",
  "sheet.placeholder": "Write in this block",
  "sheet.post": "Post",
  "sheet.comment": "Comment",

  "token.new": "New token",
  "block.yours": "Your block is {block}",

  "time.justNow": "Just now",
  "time.minutes": "{count}m ago",
  "time.hours": "{count}h ago",

  "error.counts": "The counts didn't load.",
  "error.list": "The list didn't load.",
  "error.post": "The comment wasn't posted.",
  "error.tokenRequired": "A token is required.",

  "error.serverNoToken": "You need a token to post here.",
  "error.serverWrongBlock": "That is not your block.",
  "error.serverEmpty": "Write something first.",
  "error.serverTooLong": "That is too long.",
  "error.serverStore": "The server failed. Try again.",
  "error.serverArea": "That block is not valid.",
  "error.serverSignIn": "Sign in to post.",
  "error.serverProvider": "This sign-in provider is not allowed.",

  "demo.note1": "The light just turned.",
  "demo.note2": "Someone is tuning a radio under the tree.",
  "demo.note3": "Two dogs, one umbrella.",
  "demo.note4": "The bakery is out of egg tarts.",
  "demo.note5": "Rain started. Three people under the awning.",
  "demo.note6": "A red umbrella is still on the bench.",
} as const;

export type MessageKey = keyof typeof en;

const zhHant: Record<MessageKey, string> = {
  "brand.tagline": "腳下這一格，只留一天",
  "map.loading": "地圖載入中",
  "map.zoomHint": "放大以顯示街區",
  "locale.label": "語言",

  "auth.google": "使用 Google 登入",
  "auth.apple": "使用 Apple 登入",
  "auth.facebook": "使用 Facebook 登入",
  "auth.signingIn": "登入中",
  "auth.signedIn": "已登入",
  "auth.signOut": "登出",
  "auth.notConfigured": "未設定登入方式。",

  "demo.state": "示範狀態",
  "demo.read": "未登入",
  "demo.wait": "等候發言權",
  "demo.token": "已取得發言權",
  "demo.other": "正在讀另一格",
  "demo.live": "實況",

  "sheet.close": "關閉",
  "sheet.loading": "留言載入中",
  "sheet.empty": "過去 24 小時沒有留言。",
  "sheet.yours": "你所在的這一格",
  "sheet.waiting": "等候發言權。",
  "sheet.placeholder": "寫在這一格",
  "sheet.post": "張貼",
  "sheet.comment": "留言",

  "token.new": "新的發言權",
  "block.yours": "你所在的這一格是 {block}",

  "time.justNow": "剛剛",
  "time.minutes": "{count} 分鐘前",
  "time.hours": "{count} 小時前",

  "error.counts": "無法載入各格留言數。",
  "error.list": "無法載入留言。",
  "error.post": "留言未能張貼。",
  "error.tokenRequired": "需要發言權才能留言。",

  "error.serverNoToken": "你需要發言權才能在此留言。",
  "error.serverWrongBlock": "這不是你所在的這一格。",
  "error.serverEmpty": "請先寫點東西。",
  "error.serverTooLong": "內容太長了。",
  "error.serverStore": "伺服器出錯，請再試一次。",
  "error.serverArea": "這一格無效。",
  "error.serverSignIn": "請先登入再留言。",
  "error.serverProvider": "不允許使用這個登入方式。",

  "demo.note1": "燈剛轉綠。",
  "demo.note2": "有人在樹下調收音機。",
  "demo.note3": "兩隻狗，一把傘。",
  "demo.note4": "餅店的蛋撻賣完了。",
  "demo.note5": "下雨了，三個人擠在騎樓下。",
  "demo.note6": "長椅上還留著一把紅傘。",
};

const zhHans: Record<MessageKey, string> = {
  "brand.tagline": "脚下这一格，只留一天",
  "map.loading": "地图加载中",
  "map.zoomHint": "放大以显示街区",
  "locale.label": "语言",

  "auth.google": "使用 Google 登录",
  "auth.apple": "使用 Apple 登录",
  "auth.facebook": "使用 Facebook 登录",
  "auth.signingIn": "登录中",
  "auth.signedIn": "已登录",
  "auth.signOut": "退出登录",
  "auth.notConfigured": "未设置登录方式。",

  "demo.state": "演示状态",
  "demo.read": "未登录",
  "demo.wait": "等待发言权",
  "demo.token": "已获得发言权",
  "demo.other": "正在读另一格",
  "demo.live": "实况",

  "sheet.close": "关闭",
  "sheet.loading": "留言加载中",
  "sheet.empty": "过去 24 小时没有留言。",
  "sheet.yours": "你所在的这一格",
  "sheet.waiting": "等待发言权。",
  "sheet.placeholder": "写在这一格",
  "sheet.post": "发布",
  "sheet.comment": "留言",

  "token.new": "新的发言权",
  "block.yours": "你所在的这一格是 {block}",

  "time.justNow": "刚刚",
  "time.minutes": "{count} 分钟前",
  "time.hours": "{count} 小时前",

  "error.counts": "无法加载各格留言数。",
  "error.list": "无法加载留言。",
  "error.post": "留言发布失败。",
  "error.tokenRequired": "需要发言权才能留言。",

  "error.serverNoToken": "你需要发言权才能在此留言。",
  "error.serverWrongBlock": "这不是你所在的这一格。",
  "error.serverEmpty": "请先写点什么。",
  "error.serverTooLong": "内容太长了。",
  "error.serverStore": "服务器出错，请再试一次。",
  "error.serverArea": "这一格无效。",
  "error.serverSignIn": "请先登录再留言。",
  "error.serverProvider": "不允许使用这个登录方式。",

  "demo.note1": "灯刚转绿。",
  "demo.note2": "有人在树下调收音机。",
  "demo.note3": "两只狗，一把伞。",
  "demo.note4": "饼店的蛋挞卖完了。",
  "demo.note5": "下雨了，三个人挤在骑楼下。",
  "demo.note6": "长椅上还留着一把红伞。",
};

const ja: Record<MessageKey, string> = {
  "brand.tagline": "この一区画、一日だけ",
  "map.loading": "地図を読み込み中",
  "map.zoomHint": "拡大すると区画が表示されます",
  "locale.label": "言語",

  "auth.google": "Google でログイン",
  "auth.apple": "Apple でログイン",
  "auth.facebook": "Facebook でログイン",
  "auth.signingIn": "ログイン中",
  "auth.signedIn": "ログイン済み",
  "auth.signOut": "ログアウト",
  "auth.notConfigured": "ログインが設定されていません。",

  "demo.state": "デモの状態",
  "demo.read": "ログアウト",
  "demo.wait": "トークン待ち",
  "demo.token": "トークンを取得",
  "demo.other": "別の区画を閲覧中",
  "demo.live": "ライブ",

  "sheet.close": "閉じる",
  "sheet.loading": "コメントを読み込み中",
  "sheet.empty": "過去24時間のコメントはありません。",
  "sheet.yours": "あなたの区画",
  "sheet.waiting": "トークンを待っています。",
  "sheet.placeholder": "この区画に書く",
  "sheet.post": "投稿",
  "sheet.comment": "コメント",

  "token.new": "新しいトークン",
  "block.yours": "あなたの区画は {block} です",

  "time.justNow": "たった今",
  "time.minutes": "{count} 分前",
  "time.hours": "{count} 時間前",

  "error.counts": "件数を読み込めませんでした。",
  "error.list": "一覧を読み込めませんでした。",
  "error.post": "コメントを投稿できませんでした。",
  "error.tokenRequired": "投稿にはトークンが必要です。",

  "error.serverNoToken": "ここに投稿するにはトークンが必要です。",
  "error.serverWrongBlock": "あなたの区画ではありません。",
  "error.serverEmpty": "何か書いてください。",
  "error.serverTooLong": "長すぎます。",
  "error.serverStore": "サーバーでエラーが発生しました。もう一度お試しください。",
  "error.serverArea": "この区画は無効です。",
  "error.serverSignIn": "投稿するにはログインしてください。",
  "error.serverProvider": "このログインプロバイダーは許可されていません。",

  "demo.note1": "信号がちょうど青になった。",
  "demo.note2": "木の下で誰かがラジオを合わせている。",
  "demo.note3": "犬が二匹、傘が一本。",
  "demo.note4": "パン屋のエッグタルトが売り切れ。",
  "demo.note5": "雨が降り出した。日よけの下に三人。",
  "demo.note6": "ベンチに赤い傘が置きっぱなし。",
};

const ko: Record<MessageKey, string> = {
  "brand.tagline": "이 한 칸, 단 하루",
  "map.loading": "지도 불러오는 중",
  "map.zoomHint": "확대하면 구역이 보입니다",
  "locale.label": "언어",

  "auth.google": "Google로 로그인",
  "auth.apple": "Apple로 로그인",
  "auth.facebook": "Facebook으로 로그인",
  "auth.signingIn": "로그인 중",
  "auth.signedIn": "로그인됨",
  "auth.signOut": "로그아웃",
  "auth.notConfigured": "로그인이 설정되지 않았습니다.",

  "demo.state": "데모 상태",
  "demo.read": "로그아웃",
  "demo.wait": "토큰 대기 중",
  "demo.token": "토큰 도착",
  "demo.other": "다른 구역 읽는 중",
  "demo.live": "라이브",

  "sheet.close": "닫기",
  "sheet.loading": "댓글 불러오는 중",
  "sheet.empty": "지난 24시간 동안 댓글이 없습니다.",
  "sheet.yours": "내 구역",
  "sheet.waiting": "토큰을 기다리는 중입니다.",
  "sheet.placeholder": "이 구역에 쓰기",
  "sheet.post": "게시",
  "sheet.comment": "댓글",

  "token.new": "새 토큰",
  "block.yours": "내 구역은 {block}입니다",

  "time.justNow": "방금",
  "time.minutes": "{count}분 전",
  "time.hours": "{count}시간 전",

  "error.counts": "개수를 불러오지 못했습니다.",
  "error.list": "목록을 불러오지 못했습니다.",
  "error.post": "댓글을 게시하지 못했습니다.",
  "error.tokenRequired": "게시하려면 토큰이 필요합니다.",

  "error.serverNoToken": "여기에 게시하려면 토큰이 필요합니다.",
  "error.serverWrongBlock": "내 구역이 아닙니다.",
  "error.serverEmpty": "먼저 내용을 입력하세요.",
  "error.serverTooLong": "너무 깁니다.",
  "error.serverStore": "서버 오류가 발생했습니다. 다시 시도해 주세요.",
  "error.serverArea": "이 구역은 유효하지 않습니다.",
  "error.serverSignIn": "게시하려면 로그인하세요.",
  "error.serverProvider": "이 로그인 제공자는 허용되지 않습니다.",

  "demo.note1": "신호가 방금 바뀌었어요.",
  "demo.note2": "누군가 나무 아래에서 라디오를 맞추고 있어요.",
  "demo.note3": "개 두 마리와 우산 하나.",
  "demo.note4": "빵집 에그타르트가 다 팔렸어요.",
  "demo.note5": "비가 오기 시작했어요. 차양 아래 세 사람.",
  "demo.note6": "벤치에 빨간 우산이 그대로 놓여 있어요.",
};

const th: Record<MessageKey, string> = {
  "brand.tagline": "ช่องนี้ แค่วันเดียว",
  "map.loading": "กำลังโหลดแผนที่",
  "map.zoomHint": "ซูมเข้าเพื่อดูช่อง",
  "locale.label": "ภาษา",

  "auth.google": "ลงชื่อเข้าใช้ด้วย Google",
  "auth.apple": "ลงชื่อเข้าใช้ด้วย Apple",
  "auth.facebook": "ลงชื่อเข้าใช้ด้วย Facebook",
  "auth.signingIn": "กำลังลงชื่อเข้าใช้",
  "auth.signedIn": "ลงชื่อเข้าใช้แล้ว",
  "auth.signOut": "ออกจากระบบ",
  "auth.notConfigured": "ยังไม่ได้ตั้งค่าการลงชื่อเข้าใช้",

  "demo.state": "สถานะเดโม",
  "demo.read": "ออกจากระบบแล้ว",
  "demo.wait": "รอโทเคน",
  "demo.token": "ได้โทเคนแล้ว",
  "demo.other": "กำลังอ่านช่องอื่น",
  "demo.live": "ใช้งานจริง",

  "sheet.close": "ปิด",
  "sheet.loading": "กำลังโหลดความคิดเห็น",
  "sheet.empty": "ไม่มีความคิดเห็นใน 24 ชั่วโมงที่ผ่านมา",
  "sheet.yours": "ช่องของคุณ",
  "sheet.waiting": "กำลังรอโทเคน",
  "sheet.placeholder": "เขียนในช่องนี้",
  "sheet.post": "โพสต์",
  "sheet.comment": "ความคิดเห็น",

  "token.new": "โทเคนใหม่",
  "block.yours": "ช่องของคุณคือ {block}",

  "time.justNow": "เมื่อสักครู่",
  "time.minutes": "{count} นาทีที่แล้ว",
  "time.hours": "{count} ชั่วโมงที่แล้ว",

  "error.counts": "โหลดจำนวนไม่ได้",
  "error.list": "โหลดรายการไม่ได้",
  "error.post": "โพสต์ความคิดเห็นไม่ได้",
  "error.tokenRequired": "ต้องมีโทเคนจึงจะโพสต์ได้",

  "error.serverNoToken": "คุณต้องมีโทเคนจึงจะโพสต์ที่นี่ได้",
  "error.serverWrongBlock": "นี่ไม่ใช่ช่องของคุณ",
  "error.serverEmpty": "เขียนอะไรสักอย่างก่อน",
  "error.serverTooLong": "ยาวเกินไป",
  "error.serverStore": "เซิร์ฟเวอร์ขัดข้อง โปรดลองอีกครั้ง",
  "error.serverArea": "ช่องนี้ไม่ถูกต้อง",
  "error.serverSignIn": "ลงชื่อเข้าใช้ก่อนจึงจะโพสต์ได้",
  "error.serverProvider": "ไม่อนุญาตให้ใช้ผู้ให้บริการลงชื่อเข้าใช้นี้",

  "demo.note1": "ไฟเพิ่งเปลี่ยนเป็นสีเขียว",
  "demo.note2": "มีคนกำลังจูนวิทยุอยู่ใต้ต้นไม้",
  "demo.note3": "หมาสองตัวกับร่มหนึ่งคัน",
  "demo.note4": "ร้านเบเกอรีขายทาร์ตไข่หมดแล้ว",
  "demo.note5": "ฝนเริ่มตกแล้ว มีสามคนหลบอยู่ใต้กันสาด",
  "demo.note6": "ยังมีร่มสีแดงวางอยู่บนม้านั่ง",
};

export const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en,
  "zh-Hant": zhHant,
  "zh-Hans": zhHans,
  ja,
  ko,
  th,
};

export type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text = dictionaries[locale][key] ?? en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function isLocale(value: string): value is Locale {
  return (
    value === "zh-Hant" ||
    value === "zh-Hans" ||
    value === "ja" ||
    value === "ko" ||
    value === "th" ||
    value === "en"
  );
}

function fromLanguageTag(tag: string): Locale {
  const value = tag.toLowerCase();
  if (value === "ja" || value.startsWith("ja-")) return "ja";
  if (value === "ko" || value.startsWith("ko-")) return "ko";
  if (value === "th" || value.startsWith("th-")) return "th";
  if (value.startsWith("zh")) {
    return /(hant|tw|hk|mo)/.test(value) ? "zh-Hant" : "zh-Hans";
  }
  return "en";
}

/**
 * `?lang=` wins, then a saved choice, then the browser, then English.
 * Checked in an effect so the prerendered HTML stays identical to the first
 * client render.
 */
export function resolveLocale(input: {
  search: string;
  stored: string | null;
  languages: readonly string[];
}): Locale {
  const fromQuery = new URLSearchParams(input.search).get("lang");
  if (fromQuery && isLocale(fromQuery)) return fromQuery;
  if (input.stored && isLocale(input.stored)) return input.stored;
  const primary = input.languages[0] ?? "";
  return fromLanguageTag(primary);
}

export function formatAge(
  createdAt: string,
  t: Translate,
  now = Date.now(),
): string {
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  return t("time.hours", { count: hours });
}

/**
 * The Rust API reports failures as fixed English sentences. Match them to a
 * translation key so a POST error can be shown in the reader's language.
 */
export function serverErrorKey(message?: string): MessageKey {
  const keys: Record<string, MessageKey> = {
    "a token is required": "error.serverNoToken",
    "that is not your block": "error.serverWrongBlock",
    "text is empty": "error.serverEmpty",
    "text is too long": "error.serverTooLong",
    "the store failed": "error.serverStore",
    "area is invalid": "error.serverArea",
    "sign in is required": "error.serverSignIn",
    "provider is not allowed": "error.serverProvider",
  };
  return message && keys[message] ? keys[message] : "error.post";
}

export function errorText(reason: unknown, t: Translate): string {
  if (reason instanceof Error && reason.name === "ApiError") {
    return t(reason.message as MessageKey);
  }
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  return t("error.post");
}
