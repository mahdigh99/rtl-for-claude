<div align="center">

<img src="browser-extension/icons/icon-128.png" width="92" alt="RTL for Claude" />

# RTL for Claude

**دائیں سے بائیں لکھی جانے والی زبانیں، اب Claude میں ٹھیک ٹھیک نظر آتی ہیں۔**
خودکار RTL اور خوبصورت Vazirmatn فونٹ — کسی سیٹنگ کی جھنجھٹ کے بغیر۔

![License](https://img.shields.io/badge/License-MIT-3b82f6)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Firefox](https://img.shields.io/badge/Firefox-supported-success)
![VS Code](https://img.shields.io/badge/VS%20Code-Claude%20Code-success)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20local-8b5cf6)

[English](README.md) · [فارسی](README.fa.md) · [العربية](README.ar.md) · **اردو**

</div>

---

<div dir="rtl">

Claude کے جواب کمال کے ہوتے ہیں، مگر اردو لکھتے ہی وہ بائیں طرف کھسک کر بکھر جاتے ہیں۔ یہ ایکسٹینشن ایک کلک میں سب کچھ سیدھا کر دیتی ہے اور باقی ہر جگہ بالکل بے ضرر رہتی ہے۔

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
- 🎛️ **ایک کلک کنٹرول** — کسی پیغام پر بات نہ بنے تو اسی پر موجود ننھا سا ٹوگل رخ بدل دیتا ہے۔
- 🧠 **صرف Claude نہیں** — ChatGPT اور Gemini پر بھی اتنی ہی روانی سے چلتی ہے۔
- 🔒 **پوری طرح نجی** — سو فیصد آپ کے ڈیوائس پر۔ نہ کوئی سرور، نہ کوئی ٹریکنگ۔

## 🚀 انسٹال کریں

جو چاہیے وہ چن لیں — ہر حصہ اپنے آپ میں مکمل اور الگ ڈاؤن لوڈ ہے۔

**Browser — Chrome / Edge / Brave**

1. سب سے پہلے [`browser-extension`](browser-extension) فولڈر ڈاؤن لوڈ کریں۔
2. پھر `chrome://extensions` کھولیں اور **Developer mode** آن کر دیں۔
3. اب **Load unpacked** پر کلک کر کے وہی فولڈر چن لیں۔ بس، ہو گیا۔ ✅

**Browser — Firefox**

1. پہلے `about:debugging` کھول کر **Load Temporary Add-on** پر کلک کریں۔
2. پھر `browser-extension/manifest.json` فائل چن لیں۔

**VS Code — Claude Code**

**Marketplace** سے: **«RTL for Claude»** سرچ کریں (یا
[لسٹنگ](https://marketplace.visualstudio.com/items?itemName=mahdigh99.rtl-for-claude)
کھولیں)، **Install** دبائیں، پھر **Developer: Reload Window** چلائیں۔

یا **`.vsix`** سے: [Releases](https://github.com/mahdigh99/rtl-for-claude/releases) سے
`rtl-for-claude-vscode-*.vsix` ڈاؤن لوڈ کریں اور VS Code میں
**Extensions ← `…` ← Install from VSIX…** کریں۔

بغیر انسٹال: `bash vscode-extension/apply-rtl.sh`۔ مکمل گائیڈ:
[vscode-extension/README.md](vscode-extension/README.md)۔

## 🎛️ اپنی مرضی کے مطابق

ٹول بار کے آئیکن پر کلک کریں اور سب کچھ خود طے کریں — پہچان کی حساسیت، فونٹ، متن کا سائز، سطروں کا فاصلہ، ہر پیغام والا ٹوگل اور یہ بھی کہ کن کن سائٹس پر یہ چلے۔

## 🔒 رازداری

سو فیصد آپ کے ڈیوائس پر، نہ کوئی سرور نہ کوئی ٹریکنگ — کچھ بھی آپ کے براؤزر سے باہر نہیں جاتا۔

## ❤️ شکریہ

یہ سب اوپن سورس [Vazirmatn](https://github.com/rastikerdar/vazirmatn) فونٹ کے دم سے ممکن ہوا، جسے صابر راستی کردار نے بنایا (لائسنس SIL OFL)۔ کوڈ [MIT License](LICENSE) کے تحت ہے۔

</div>

---

<div align="center"><sub>اُن سب کے لیے، جن کی سوچ دائیں سے بائیں چلتی ہے۔</sub></div>
