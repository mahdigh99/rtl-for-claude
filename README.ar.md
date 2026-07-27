<div align="center">

<img src="browser-extension/icons/icon-128.png" width="92" alt="RTL for Claude" />

# RTL for Claude

**أخيرًا، العربية تظهر في Claude كما ينبغي لها.**
محاذاة من اليمين إلى اليسار تشتغل وحدها، وخط Vazirmatn الأنيق — من دون أي إعداد.

![License](https://img.shields.io/badge/License-MIT-3b82f6)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Firefox](https://img.shields.io/badge/Firefox-supported-success)
![VS Code](https://img.shields.io/badge/VS%20Code-Claude%20Code-success)
![macOS](https://img.shields.io/badge/macOS-Claude%20Desktop-success)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20local-8b5cf6)

[English](README.md) · [فارسی](README.fa.md) · **العربية** · [اردو](README.ur.md)

</div>

---

<div dir="rtl">

ردود Claude رائعة، لكن النص العربي يخرج محاذًى لليسار ومتشابكًا. هذه الأداة تُرجع كل شيء إلى مكانه الصحيح بنقرة واحدة، ثم تبتعد عن طريقك تمامًا.

| 😖 قبل التثبيت | 😍 بعد التثبيت |
| --- | --- |
| الردود العربية تخرج محاذاةً لليسار ومبعثرة | كل رد ينضبط إلى اليمين بخط أنيق وواضح |
| الكتابة تقفز يمينًا ويسارًا وأنت تكتب | صندوق الكتابة ينقلب فورًا مع أول حرف |
| الكود والإنجليزية يختلطان بالنص فيشوّهانه | الكود يبقى كودًا، والإنجليزية تبقى في مكانها |

## ✨ لماذا ستحبّها

- 🪄 **تشتغل وحدها** — تتعرّف على الاتجاه فقرةً فقرة. بلا أزرار، وبلا إعدادات.
- 🌍 **لغتك أوّلًا** — العربية تظهر كما ينبغي، وكذلك كل لغة تُكتب من اليمين إلى اليسار.
- 🔤 **خط أنيق** — خط Vazirmatn جاهز معها، بحجم وتباعد تضبطهما على راحتك.
- ⌨️ **صندوق كتابة ذكي** — ينقلب لحظة ما تبدأ بكتابة أول حرف.
- 🧩 **لا تقترب من الكود** — كتل الكود والـ diff والطرفية تبقى من اليسار لليمين كما هي.
- 🎛️ **تجاوز بنقرة** — زر عائم تلقائي / يمين / يسار يثبّت اتجاه المحادثة كاملة (`Cmd/Ctrl + Shift + 9`)؛ وفي محادثة Claude Code لكل رسالة زر ⇌ خاص بها.
- 🧠 **أبعد من Claude** — تشتغل أيضًا على ChatGPT و Gemini.
- 🔒 **خاصة بالكامل** — محليّة 100%؛ لا خوادم ولا تتبّع، أبدًا.

## 🚀 التثبيت

اختر ما يناسبك — كل جزء يُنزَّل لوحده.

**المتصفّح — Chrome / Edge / Brave**

1. نزّل مجلّد [`browser-extension`](browser-extension).
2. افتح `chrome://extensions` وفعّل **Developer mode**.
3. اضغط **Load unpacked** واختر المجلّد. وانتهى الأمر. ✅

**المتصفّح — Firefox**

1. افتح `about:debugging` ثم اختر **Load Temporary Add-on**.
2. حدّد الملفّ `browser-extension/manifest.json`.

**VS Code — Claude Code**

من **الـ Marketplace**: ابحث عن **«RTL for Claude»** (أو افتح
[الصفحة](https://marketplace.visualstudio.com/items?itemName=mahdigh99.rtl-for-claude))
واضغط **Install**، ثم نفّذ **Developer: Reload Window**.

أو عبر ملف **`.vsix`**: نزّل `rtl-for-claude-vscode-*.vsix` من
[Releases](https://github.com/mahdigh99/rtl-for-claude/releases)، ثم في VS Code
نفّذ **Extensions ← `…` ← Install from VSIX…**.

بدون تثبيت: `bash vscode-extension/apply-rtl.sh`. الدليل الكامل:
[vscode-extension/README.md](vscode-extension/README.md).

**VS Code — Codex**

للوحة Codex استخدم أداة الترقيع المستقلة الخاصة بها:

```bash
bash vscode-extension-codex/apply-rtl.sh
```

أو بدون تنزيل أي شيء: `npx rtl-for-claude` ← الخيار **3**.

ثم نفّذ **Developer: Reload Window**. أعد تشغيل الأمر بعد كل تحديث لـ Codex.
لاستعادة المظهر الأصلي: `bash vscode-extension-codex/apply-rtl.sh --remove`.

اسم المنتج في الـ Marketplace الآن هو **Codex**، لكن المعرّف التقني لمجلد
التثبيت ما يزال `openai.chatgpt`. الدليل الكامل:
[vscode-extension-codex/README.md](vscode-extension-codex/README.md).

**تطبيق Claude Desktop — macOS**

افتح Terminal والصق هذا السطر الواحد:

```bash
npx rtl-for-claude
```

تظهر قائمة؛ اختر **Claude Desktop**. يبني **نسخة مُرقَّعة منفصلة** في
`~/Applications/Claude-RTL.app` — ولا يُعدّل تطبيق Claude.app الأصلي إطلاقًا —
فما عليك سوى فتح **Claude-RTL**. أعد تنفيذه بعد كل تحديث لـ Claude Desktop،
و`npx rtl-for-claude --desktop --remove` يحذف النسخة.

<sub>تفضّل قراءة السكربت قبل تشغيله؟ نزّل المستودع ونفّذ
`bash desktop-app/apply-rtl.sh --install` — نفس المُرقِّع ونفس النتيجة. كلاهما
يحتاج Node.js وأدوات Xcode لسطر الأوامر، و`npx rtl-for-claude --doctor` يتحقق
منهما. الدليل الكامل: [desktop-app/README.md](desktop-app/README.md).</sub>

## 🎛️ على ذوقك أنت

اضغط أيقونة شريط الأدوات لتضبط حساسية الاكتشاف، والخط (المرفق أو خط مثبّت على جهازك)، وحجم النص، وتباعد الأسطر، وزر الاتجاه العائم، ولغة النافذة، والمواقع التي تشتغل عليها — بما فيها مواقعك أنت.

## 🔒 الخصوصية

محليّة 100%؛ لا خوادم، ولا تتبّع، ولا يغادر متصفّحك أي شيء.

## ❤️ شكر وتقدير

تعتمد على خط [Vazirmatn](https://github.com/rastikerdar/vazirmatn) مفتوح المصدر، من تصميم Saber Rastikerdar (رخصة SIL OFL). والكود تحت [رخصة MIT](LICENSE).

</div>

---

<div align="center"><sub>صُنعت لكل من يفكّر من اليمين إلى اليسار.</sub></div>
