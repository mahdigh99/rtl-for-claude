<div align="center">

<img src="browser-extension/icons/icon-128.png" width="92" alt="RTL for Claude" />

# RTL for Claude

**أخيرًا، العربية تظهر في Claude كما ينبغي لها.**
محاذاة من اليمين إلى اليسار تشتغل وحدها، وخط Vazirmatn الأنيق — من دون أي إعداد.

![License](https://img.shields.io/badge/License-MIT-3b82f6)
![npm](https://img.shields.io/npm/v/rtl-for-claude)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Firefox](https://img.shields.io/badge/Firefox-supported-success)
![VS Code](https://img.shields.io/badge/VS%20Code-Claude%20Code-success)
![macOS](https://img.shields.io/badge/macOS-Claude%20Desktop-success)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20local-8b5cf6)

[English](README.md) · [فارسی](README.fa.md) · **العربية** · [اردو](README.ur.md)

<img src="docs/demo.gif" width="640" alt="RTL for Claude أثناء العمل" />

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

أمامك طريقان، والنتيجة واحدة.

### الطريقة السريعة — أمر واحد يكفي

```bash
npx rtl-for-claude
```

- **القائمة**: تنقّل بالأسهم واختر — تطبيق Claude Desktop، أو محادثة
  Claude Code أو Codex، أو إضافة VS Code نفسها.
- **التراجع**: شغّله من جديد واختر الإزالة، فيعود كل شيء كما كان.

لا تريد الطرفية أصلًا؟ بديلان:

- 🖱️ **نقرة مزدوجة**: نزّل **Install RTL for Claude.command** من
  [Releases](https://github.com/mahdigh99/rtl-for-claude/releases/latest)
  وافتحه (أول مرة: بالزر الأيمن ثم **Open**).
- 🤖 **عبر الذكاء الاصطناعي**: أعطِ رابط المستودع لـ Claude Code واطلب منه
  التثبيت — [CLAUDE.md](CLAUDE.md) يشرح له الطريقة.

<sub>لا يحتاج سوى [Node.js](https://nodejs.org) الإصدار 18 فأحدث. استثناءان:
إضافة المتصفح لا تُثبَّت من هذه القائمة (تجدها أدناه مباشرة)، وعلى Windows
اسلك الطريقة اليدوية حاليًا.</sub>

---

### الطريقة اليدوية — كل شيء بين يديك

لا سحر هنا: كل جزء إما سكربت يمكنك فتحه وقراءته سطرًا سطرًا قبل تشغيله، وإما
مجلد تحمّله في المتصفح بنفسك. لا تحب تشغيل ما لم تقرأه؟ هذه طريقتك.

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

لا تريد الإضافة أصلًا؟ `bash vscode-extension/apply-rtl.sh` يرقّع المحادثة
مباشرة. الدليل الكامل:
[vscode-extension/README.md](vscode-extension/README.md).

**VS Code — Codex**

أسهل طريقة هي إضافة **RTL for Claude** أعلاه: حين تكون Codex مثبّتة تعرض —
مرة واحدة — أن تغطي محادثة Codex أيضًا، ثم تعيد تطبيق نفسها بعد كل تحديث لها
(الإعداد `rtlForClaude.codex.enabled`).

والطريقة اليدوية هي مُرقِّعها المستقل:

```bash
bash vscode-extension-codex/apply-rtl.sh
```

ثم نفّذ **Developer: Reload Window**؛ هذا عليك إعادة تشغيله بنفسك بعد كل
تحديث لـ Codex، و`--remove` يستعيد المظهر الأصلي.

اسم المنتج في الـ Marketplace الآن **Codex**، لكن مجلد التثبيت ما يزال يحمل
المعرّف القديم `openai.chatgpt` — وهذا متوقَّع. الدليل الكامل:
[vscode-extension-codex/README.md](vscode-extension-codex/README.md).

**تطبيق Claude Desktop — macOS فقط**

نزّل المستودع، واقرأ السكربت إن شئت، ثم نفّذه:

```bash
bash desktop-app/apply-rtl.sh --install
```

**نتيجة التثبيت تطبيق ثانٍ اسمه Claude-RTL** — تطبيق Claude الأصلي لا يُمَسّ
ويبقى يعمل كما هو. التطبيق الجديد ليس بجوار الأصلي: يذهب إلى مجلد
Applications داخل مجلد المنزل (`~/Applications`)، وأسهل طريقة للعثور عليه هي
Spotlight — اكتب **Claude-RTL**. افتح هذا من الآن فصاعدًا. أعد تشغيل المُرقِّع
بعد كل تحديث لـ Claude Desktop؛ و`--remove` يحذف التطبيق الثاني ويعود كل شيء
كما كان.

<sub>يحتاج Node.js وأدوات Xcode لسطر الأوامر — `npx rtl-for-claude --doctor`
يخبرك إن كان شيء ناقصًا. الدليل الكامل:
[desktop-app/README.md](desktop-app/README.md).</sub>

## 🎛️ على ذوقك أنت

اضغط أيقونة شريط الأدوات لتضبط حساسية الاكتشاف، والخط (المرفق أو خط مثبّت على جهازك)، وحجم النص، وتباعد الأسطر، وزر الاتجاه العائم، ولغة النافذة، والمواقع التي تشتغل عليها — بما فيها مواقعك أنت.

## ❓ أسئلة شائعة

**تحدّث Claude وعاد الخلل من جديد. ماذا الآن؟**
إضافة المتصفح لا تتأثر بالتحديثات أصلًا، وإضافة VS Code تعيد تطبيق نفسها — على المحادثتين إن فعّلت تغطية Codex. وحدها الترقيعات اليدوية — تطبيق سطح المكتب، والمحادثات إن رقّعتها دون الإضافة — تحتاج تشغيل الأمر نفسه مرة أخرى.

**ما الذي يلمسه بالضبط؟**
لا شيء من الملفات الأصلية. تطبيق سطح المكتب يُرقَّع كنسخة منفصلة (Claude-RTL)، وترقيعات VS Code تأخذ نسخة احتياطية (`*.rtl-backup`) من كل ملف قبل تغييره. وكل شيء يجري دون اتصال، على جهازك أنت.

**و Windows أو Linux؟**
إضافة المتصفح وإضافة VS Code تعملان في كل مكان؛ وترقيع تطبيق سطح المكتب لـ macOS فقط حاليًا.

**كيف أتراجع عن كل شيء؟**
شغّل `npx rtl-for-claude` واختر الإزالة، أو مرّر `--remove` لأي من السكربتات؛ والإضافات تُزال كأي إضافة أخرى.

## 🔒 الخصوصية

محليّة 100%؛ لا خوادم، ولا تتبّع، ولا يغادر متصفّحك أي شيء.

## ⭐ إن أفادك

امنح المشروع نجمة ليصل إلى غيرك. وجدت مشكلة؟ [افتح Issue](https://github.com/mahdigh99/rtl-for-claude/issues).

## ❤️ في ذكرى صابر

خط المشروع هو [Vazirmatn](https://github.com/rastikerdar/vazirmatn) — في ذكرى الراحل صابر راستي‌كردار، الذي ترك خطوطه حرة للجميع. والكود تحت [رخصة MIT](LICENSE).

</div>

---

<div align="center"><sub>صُنعت لكل من يفكّر من اليمين إلى اليسار.</sub></div>
