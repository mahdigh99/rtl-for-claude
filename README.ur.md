<div align="center">

<img src="browser-extension/icons/icon-128.png" width="92" alt="RTL for Claude" />

# RTL for Claude

**دائیں سے بائیں لکھی جانے والی زبانیں، اب Claude میں ٹھیک ٹھیک نظر آتی ہیں۔**
خودکار RTL اور خوبصورت Vazirmatn فونٹ — کسی سیٹنگ کی جھنجھٹ کے بغیر۔

![License](https://img.shields.io/badge/License-MIT-3b82f6)
![npm](https://img.shields.io/npm/v/rtl-for-claude)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Firefox](https://img.shields.io/badge/Firefox-supported-success)
![VS Code](https://img.shields.io/badge/VS%20Code-Claude%20Code-success)
![macOS](https://img.shields.io/badge/macOS-Claude%20Desktop-success)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20local-8b5cf6)

[English](README.md) · [فارسی](README.fa.md) · [العربية](README.ar.md) · **اردو**

<img src="docs/demo.gif" width="640" alt="RTL for Claude عمل میں" />

</div>

---

<div dir="rtl">

یوں تو Claude کے جواب کمال کے ہوتے ہیں، مگر اردو لکھتے ہی وہ بائیں طرف کھسک کر بکھر جاتے ہیں۔ یہ ایکسٹینشن ایک کلک میں سب کچھ سیدھا کر دیتی ہے اور باقی ہر جگہ بالکل بے ضرر رہتی ہے۔

| 😖 پہلے کا حال | 😍 اب کا مزہ |
| --- | --- |
| اردو جواب بائیں سے شروع ہو کر الجھ جاتے تھے | ہر جواب صاف ستھرے فونٹ میں دائیں سے بائیں سج جاتا ہے |
| لکھتے وقت کرسر اِدھر اُدھر اچھلتا تھا | لکھنے کا خانہ ساتھ ساتھ خود پلٹتا جاتا ہے |
| کوڈ اور انگریزی متن آپس میں گڈمڈ ہو جاتے تھے | کوڈ اپنی جگہ، انگریزی اپنی جگہ |

## ✨ یہ آپ کو کیوں پسند آئے گی

- 🪄 **خودکار** — ہر پیراگراف کا رخ خود پہچان لیتی ہے۔ نہ کوئی بٹن، نہ کوئی سیٹنگ۔
- 🌍 **آپ کی زبان** — اردو، عربی، فارسی، پشتو، عبرانی اور دائیں سے بائیں لکھی جانے والی باقی زبانیں بھی بخوبی سنبھال لیتی ہے۔
- 🔤 **خوبصورت تحریر** — ساتھ آنے والا Vazirmatn فونٹ، سائز اور سطروں کا فاصلہ سب آپ کی مرضی کے مطابق۔
- ⌨️ **سمجھدار خانہ** — لکھنا شروع کرتے ہی لکھنے کا خانہ خود دائیں سے بائیں ہو جاتا ہے۔
- 🧩 **کوڈ محفوظ** — کوڈ بلاکس، diff اور ٹرمینل بائیں سے دائیں ہی رہتے ہیں، بگڑتے نہیں۔
- 🎛️ **ایک کلک کنٹرول** — ایک تیرتا خودکار / RTL / LTR بٹن پوری چیٹ کا رخ طے کر دیتا ہے (`Cmd/Ctrl + Shift + 9`)؛ اور Claude Code چیٹ میں ہر پیغام پر اپنا ⇌ بٹن بھی ہے۔
- 🧠 **صرف Claude نہیں** — ChatGPT اور Gemini پر بھی اتنی ہی روانی سے چلتی ہے۔
- 🔒 **پوری طرح نجی** — سو فیصد آپ کے ڈیوائس پر۔ نہ کوئی سرور، نہ کوئی ٹریکنگ۔

## 🚀 انسٹال کریں

دو راستے ہیں؛ نتیجہ ایک ہی ہے۔

### تیز طریقہ — بس ایک کمانڈ

```bash
npx rtl-for-claude
```

- **مینو**: ایرو کیز سے چنیں — Claude Desktop ایپ، Claude Code یا Codex کی
  چیٹ، یا خود VS Code ایکسٹینشن۔
- **واپسی**: دوبارہ چلائیں اور ہٹانے کا آپشن چن لیں؛ سب کچھ جوں کا توں لوٹ
  آتا ہے۔

ٹرمینل بالکل نہیں چاہیے؟ دو متبادل:

- 🖱️ **ڈبل کلک**: [Releases](https://github.com/mahdigh99/rtl-for-claude/releases/latest)
  سے **Install RTL for Claude.command** فائل لے کر کھولیں (پہلی بار: رائٹ
  کلک، پھر **Open**)۔
- 🤖 **بذریعہ AI**: ریپو کا لنک Claude Code کو دے کر انسٹال کا کہہ دیں —
  [CLAUDE.md](CLAUDE.md) میں ہدایات موجود ہیں۔

<sub>صرف [Node.js](https://nodejs.org) 18 یا نیا چاہیے۔ دو استثنا: براؤزر
ایکسٹینشن اس مینو سے انسٹال نہیں ہوتی (وہ بالکل نیچے ہے)، اور Windows پر فی
الحال دستی طریقہ اپنائیں۔</sub>

---

### دستی طریقہ — سب کچھ آپ کے ہاتھ میں

کوئی جادو نہیں: ہر حصہ یا تو ایک اسکرپٹ ہے جسے آپ چلانے سے پہلے کھول کر پڑھ
سکتے ہیں، یا ایک فولڈر جو آپ خود براؤزر میں لوڈ کرتے ہیں۔ اَن دیکھی چیز
چلانا پسند نہیں؟ تو یہی راستہ آپ کا ہے۔

**Browser — Chrome / Edge / Brave**

1. سب سے پہلے [`browser-extension`](browser-extension) فولڈر ڈاؤن لوڈ کریں۔
2. پھر `chrome://extensions` کھولیں اور **Developer mode** آن کر دیں۔
3. اب **Load unpacked** پر کلک کر کے وہی فولڈر چن لیں۔ بس، ہو گیا۔ ✅

**Browser — Firefox**

1. پہلے `about:debugging` کھول کر **Load Temporary Add-on** پر کلک کریں۔
2. پھر `browser-extension/manifest.json` فائل چن لیں۔

**VS Code — Claude Code**

سیدھا **Marketplace** سے: **«RTL for Claude»** سرچ کریں (یا
[لسٹنگ](https://marketplace.visualstudio.com/items?itemName=mahdigh99.rtl-for-claude)
کھولیں)، **Install** دبائیں، پھر **Developer: Reload Window** چلائیں۔

یا **`.vsix`** سے: [Releases](https://github.com/mahdigh99/rtl-for-claude/releases) سے
`rtl-for-claude-vscode-*.vsix` ڈاؤن لوڈ کریں اور VS Code میں
**Extensions ← `…` ← Install from VSIX…** کریں۔

ایکسٹینشن بھی نہیں چاہیے؟ `bash vscode-extension/apply-rtl.sh` سیدھا چیٹ کو
پیچ کر دیتا ہے۔ مکمل گائیڈ:
[vscode-extension/README.md](vscode-extension/README.md)۔

**VS Code — Codex**

سب سے آسان راستہ اوپر والی **RTL for Claude** ایکسٹینشن ہے: Codex انسٹال ہو
تو ایک بار خود پوچھتی ہے کہ Codex چیٹ بھی سنبھال لے، اور پھر Codex کی ہر
اپڈیٹ کے بعد خود دوبارہ لاگو ہو جاتی ہے (سیٹنگ `rtlForClaude.codex.enabled`)۔

دستی راستہ اس کا الگ پیچر ہے:

```bash
bash vscode-extension-codex/apply-rtl.sh
```

پھر **Developer: Reload Window** چلائیں؛ یہ والا Codex کی ہر اپڈیٹ کے بعد آپ
کو خود دوبارہ چلانا ہو گا، اور `--remove` اصل شکل واپس لے آتا ہے۔

اب Marketplace میں اس پروڈکٹ کا نام **Codex** ہے، مگر انسٹال شدہ فولڈر پر
اب بھی پرانا شناختی نام `openai.chatgpt` ہی ہے — یہ معمول کی بات ہے۔ مکمل گائیڈ:
[vscode-extension-codex/README.md](vscode-extension-codex/README.md)۔

**ایپ Claude Desktop — صرف macOS**

ریپازٹری ڈاؤن لوڈ کریں، چاہیں تو پہلے اسکرپٹ پڑھ لیں، پھر چلائیں:

```bash
bash desktop-app/apply-rtl.sh --install
```

یہ آپ کی اصل Claude.app کو ہاتھ نہیں لگاتا؛ `~/Applications/Claude-RTL.app`
پر ایک الگ پیچ شدہ کاپی بناتا ہے، اور آئندہ آپ وہی کھولیں گے۔ Claude Desktop
کی ہر اپڈیٹ کے بعد دوبارہ چلائیں؛ `--remove` کاپی حذف کر دیتا ہے۔

<sub>اس کے لیے Node.js اور Xcode Command Line Tools درکار ہیں —
`npx rtl-for-claude --doctor` بتا دیتا ہے کہ کچھ کم تو نہیں۔ مکمل گائیڈ:
[desktop-app/README.md](desktop-app/README.md)۔</sub>

## 🎛️ اپنی مرضی کے مطابق

ٹول بار کے آئیکن پر کلک کریں اور سب کچھ خود طے کریں — پہچان کی حساسیت، فونٹ (شامل شدہ یا آپ کے کمپیوٹر پر نصب)، متن کا سائز، سطروں کا فاصلہ، تیرتا سمت بٹن، پاپ اپ کی زبان، اور یہ بھی کہ کن کن سائٹس پر یہ چلے — بشمول آپ کی اپنی سائٹس۔

## ❓ عام سوالات

**اگر Claude اپڈیٹ ہو گیا اور سب پھر بگڑ گیا تو؟**
براؤزر ایکسٹینشن پر اپڈیٹ کا اثر ہی نہیں پڑتا، اور VS Code ایکسٹینشن خود کو دوبارہ لاگو کر لیتی ہے — دونوں چیٹس پر، اگر Codex کوریج آن کی ہو۔ صرف ہاتھ سے چلائے پیچ — ڈیسک ٹاپ ایپ، اور چیٹس اگر بغیر ایکسٹینشن پیچ کی ہوں — وہی ایک کمانڈ دوبارہ مانگتے ہیں۔

**یہ بالکل کس چیز کو چھیڑتا ہے؟**
کسی اصل فائل کو نہیں۔ ڈیسک ٹاپ ایپ الگ کاپی (Claude-RTL) کے طور پر پیچ ہوتی ہے، اور VS Code کے پیچ ہر فائل کو بدلنے سے پہلے اس کا بیک اپ (`*.rtl-backup`) بناتے ہیں۔ سب کچھ آف لائن، آپ کے اپنے سسٹم پر۔

**کیا Windows یا Linux پر بھی چلتا ہے؟**
براؤزر ایکسٹینشن اور VS Code ایکسٹینشن ہر جگہ چلتی ہیں؛ ڈیسک ٹاپ پیچ فی الحال صرف macOS کے لیے ہے۔

**سب کچھ واپس کیسے کروں؟**
کمانڈ `npx rtl-for-claude` چلا کر ہٹانے کا آپشن چنیں، یا کسی بھی اسکرپٹ کو `--remove` دیں۔ ایکسٹینشنز عام ایکسٹینشنز کی طرح ان انسٹال ہو جاتی ہیں۔

## 🔒 رازداری

سو فیصد آپ کے ڈیوائس پر، نہ کوئی سرور نہ کوئی ٹریکنگ — کچھ بھی آپ کے براؤزر سے باہر نہیں جاتا۔

## ⭐ کام آیا ہو تو

ایک ستارہ دے دیں تاکہ یہ اوزار اوروں تک بھی پہنچے۔ کوئی مسئلہ ہو تو [Issue کھولیں](https://github.com/mahdigh99/rtl-for-claude/issues)۔

## ❤️ صابر کی یاد میں

اس پروجیکٹ کا فونٹ [Vazirmatn](https://github.com/rastikerdar/vazirmatn) ہے — مرحوم صابر راستی کردار کی یاد میں، جنہوں نے اپنے فونٹ سب کے لیے مفت چھوڑے۔ کوڈ [MIT License](LICENSE) کے تحت ہے۔

</div>

---

<div align="center"><sub>اُن سب کے لیے، جن کی سوچ دائیں سے بائیں چلتی ہے۔</sub></div>
