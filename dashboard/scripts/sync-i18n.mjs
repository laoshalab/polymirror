import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n", "locales");

function parseMessages(file) {
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/export const \w+: Messages = (\{[\s\S]*\});/);
  if (!m) throw new Error(`parse fail: ${file}`);
  return eval(`(${m[1]})`);
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") {
      out[k] = deepMerge(base[k], v);
    } else if (!(k in base)) {
      out[k] = v;
    }
  }
  return out;
}

function toTraditional(text) {
  return text
    .replace(/设置/g, "設定")
    .replace(/账户/g, "帳戶")
    .replace(/加载/g, "載入")
    .replace(/显示/g, "顯示")
    .replace(/网络/g, "網路")
    .replace(/连接/g, "連線")
    .replace(/保存/g, "儲存")
    .replace(/编辑/g, "編輯")
    .replace(/创建/g, "建立")
    .replace(/禁用/g, "停用")
    .replace(/简体/g, "簡體")
    .replace(/设置页/g, "設定頁")
    .replace(/系统/g, "系統")
    .replace(/运行/g, "執行")
    .replace(/帮助/g, "說明")
    .replace(/参考资料/g, "參考資料")
    .replace(/快速入门/g, "快速入門")
    .replace(/安装/g, "安裝")
    .replace(/登录/g, "登入")
    .replace(/我的账户/g, "我的帳戶")
    .replace(/发现/g, "發現")
    .replace(/总览/g, "總覽")
    .replace(/持仓/g, "持倉")
    .replace(/订单/g, "訂單")
    .replace(/活动流/g, "活動流")
    .replace(/风控/g, "風控")
    .replace(/模式/g, "模式")
    .replace(/常见问题/g, "常見問題")
    .replace(/速查表/g, "速查表")
    .replace(/完整说明书/g, "完整說明書")
    .replace(/盈亏/g, "盈虧")
    .replace(/刷新/g, "重新整理")
    .replace(/区间/g, "區間")
    .replace(/引擎/g, "引擎")
    .replace(/链上/g, "鏈上")
    .replace(/配置/g, "設定")
    .replace(/代理/g, "代理")
    .replace(/凭证/g, "憑證")
    .replace(/回显/g, "回顯")
    .replace(/重启/g, "重啟")
    .replace(/填写/g, "填寫")
    .replace(/留空/g, "留空")
    .replace(/推断/g, "推斷")
    .replace(/子账户/g, "子帳戶")
    .replace(/十六进制/g, "十六進位")
    .replace(/当前/g, "目前")
    .replace(/已禁用/g, "已停用")
    .replace(/今日/g, "今日")
    .replace(/跟单/g, "跟單")
    .replace(/比例/g, "比例")
    .replace(/单笔/g, "單筆")
    .replace(/成交额/g, "成交額")
    .replace(/处理/g, "處理")
    .replace(/挂单/g, "掛單")
    .replace(/合并/g, "合併")
    .replace(/条/g, "條")
    .replace(/请确认/g, "請確認")
    .replace(/无法/g, "無法")
    .replace(/拉取/g, "拉取")
    .replace(/检查/g, "檢查")
    .replace(/认证/g, "認證")
    .replace(/未配置/g, "未設定")
    .replace(/未提供/g, "未提供")
    .replace(/格式不正确/g, "格式不正確")
    .replace(/应为数字/g, "應為數字")
    .replace(/撤销/g, "撤銷")
    .replace(/移除/g, "移除")
    .replace(/卖出/g, "賣出")
    .replace(/跳过/g, "跳過")
    .replace(/清空/g, "清空")
    .replace(/手动/g, "手動");
}

function cloneTraditional(obj) {
  if (typeof obj === "string") return toTraditional(obj);
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = cloneTraditional(v);
  return out;
}

function stringifyValue(v, indent) {
  const sp = "  ".repeat(indent);
  if (typeof v === "string") {
    if (v.includes("\n")) {
      return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return JSON.stringify(v);
  }
  if (v && typeof v === "object") {
    const lines = ["{"];
    for (const [k, val] of Object.entries(v)) {
      lines.push(`${sp}  ${k}: ${stringifyValue(val, indent + 1)},`);
    }
    lines.push(`${sp}}`);
    return lines.join("\n");
  }
  return String(v);
}

function writeLocale(name, exportName, messages) {
  const body = stringifyValue(messages, 0);
  const out = `import type { Messages } from "../types";\n\nexport const ${exportName}: Messages = ${body};\n`;
  fs.writeFileSync(path.join(root, `${name}.ts`), out);
}

const zh = parseMessages(path.join(root, "zh.ts"));
const en = parseMessages(path.join(root, "en.ts"));
en.hourlyChart = { ...en.hourlyChart, chartAria: "24-hour copy activity bar chart" };

const zhTW = deepMerge(parseMessages(path.join(root, "zh-TW.ts")), cloneTraditional(zh));
const ja = deepMerge(parseMessages(path.join(root, "ja.ts")), en);
const ko = deepMerge(parseMessages(path.join(root, "ko.ts")), en);

writeLocale("zh-TW", "zhTW", zhTW);
writeLocale("ja", "ja", ja);
writeLocale("ko", "ko", ko);

// patch en hourlyChart only
const enFile = fs.readFileSync(path.join(root, "en.ts"), "utf8");
if (!enFile.includes("chartAria")) {
  const patched = enFile.replace(
    /subtitle: "COPY \/ SKIP \/ ERROR distribution in the last 24 hours · \{total\} copies total",\n  \},/,
    'subtitle: "COPY / SKIP / ERROR distribution in the last 24 hours · {total} copies total",\n    chartAria: "24-hour copy activity bar chart",\n  },'
  );
  fs.writeFileSync(path.join(root, "en.ts"), patched);
}

console.log("synced zh-TW, ja, ko, en chartAria");
