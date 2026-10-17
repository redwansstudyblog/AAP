---
name: aap-site-setup
description: Use this file whenever the goal is to make a website support the AI Access Protocol (AAP) — i.e. add a documented, API-key-based door that AI agents can use instead of simulating a browser login. Trigger this when a site owner or developer says things like "make my site AI-accessible", "add AAP to this site", "let AI log into our dashboard safely", or hands you this package alongside their website's codebase. Follow it as a step-by-step setup, not just reference material — after reading it you should go implement the files, not just summarize them.
---

# AAP সাইট সেটআপ গাইড (ওয়েবসাইট মালিক / ডেভেলপারের জন্য)

এই প্যাকেজটা ব্যবহার করে একজন ডেভেলপার (মানুষ অথবা AI, যে কেউ এই ফাইলটা পড়ছে) একটা ওয়েবসাইটকে **AI Access Protocol (AAP)**-কমপ্লায়েন্ট বানিয়ে ফেলতে পারবে — মানে, সাইটটা AI এজেন্টদের জন্য একটা নিরাপদ, documented দরজা খুলে দেবে, যেখানে real user password লাগবে না, শুধু একটা scoped API key লাগবে।

**এই গাইড অনুসরণ করা মানে শুধু পড়া না — পড়ে সরাসরি কোডবেসে ফাইল যোগ/এডিট করে ফেলা।** যদি এটা কোনো AI পড়ে, তার উচিত ব্যাখ্যা করার বদলে বাস্তবে এই ধাপগুলো করে ফেলা (যদি তার কোডবেস অ্যাক্সেস থাকে)।

## এই প্যাকেজে কী কী আছে

| ফাইল | কাজ |
|---|---|
| `SETUP.md` | এই গাইড |
| `SPEC.md` | প্রোটোকলের সম্পূর্ণ স্পেসিফিকেশন (single-use key → session মডেলসহ) |
| `middleware/express.js` | Express.js সাইটের জন্য discovery route রেডি কোড |
| `middleware/nextjs.js` | Next.js (App Router) সাইটের জন্য discovery route রেডি কোড |
| `middleware/keyStore.js` | key জেনারেট/redeem/session-validate/revoke করার আসল লজিক (hashing + single-use গ্যারান্টি সহ) |
| `middleware/nextjs-key-routes.js` | অ্যাডমিন key routes + redeem route + টাস্ক endpoint টেমপ্লেট |
| `examples/ai-access.json` | discovery ফাইলের একটা পূর্ণ উদাহরণ |
| `examples/AdminKeyPanel.jsx` | রেডি React কম্পোনেন্ট — "Generate Key" বাটন + নতুন-ভার্সন নোটিফিকেশন ব্যানার সহ পুরো অ্যাডমিন প্যানেল |
| `middleware/telemetry.js` | কেন্দ্রীয় Control Panel-এর (Package 3) সাথে কথা বলার ক্লায়েন্ট — usage log পাঠানো, ব্লক/আপডেট-প্রয়োজন চেক করা |

## ধাপে ধাপে সেটআপ

### ধাপ ১ — ফ্রেমওয়ার্ক চিহ্নিত করা
সাইটের কোডবেস দেখে ঠিক করুন Next.js নাকি Express (নাকি অন্য কিছু)। Vercel-এ হোস্ট করা বেশিরভাগ সাইটই Next.js। `middleware/` ফোল্ডারে যে ফাইলটা মিলবে সেটা ব্যবহার করুন; অন্য ফ্রেমওয়ার্ক হলে একই লজিক (discovery route + key-checking middleware) নিজের ফ্রেমওয়ার্কে অনুবাদ করে নিন।

### ধাপ ২ — কোন কোন তথ্য/কাজ AI-কে দেওয়া হবে, সেটা ঠিক করা
সব কিছু না খুলে, শুধু যেটুকু দরকার সেটুকু ঠিক করুন। যেমন: "ড্যাশবোর্ডের সামারি দেখা", "ক্লাস লিস্ট দেখা" — পাসওয়ার্ড রিসেট, বিলিং-এর মতো sensitive অ্যাকশন সাধারণত AI-কে দেওয়া উচিত না, যদি না স্পষ্টভাবে দরকার হয়।

### ধাপ ৩ — key/session স্টোরেজ বানানো
`middleware/keyStore.js`-এ পুরো লজিক রেডি আছে (single-use key → short-lived session মডেল — অর্থাৎ **একটা key একবারই কাজ করবে**, redeem করার সাথে সাথে মরে যাবে, আর তার বদলে একটা সাময়িক session token পাওয়া যাবে যেটা দিয়ে কাজের বাকি অংশ চলবে)। দুটো টেবিল/কালেকশন লাগবে, দুটোরই শেপ `keyStore.js`-এ কমেন্ট করে লেখা আছে:
- **keys** — key-এর হ্যাশ, কোন account-এর, কোন scope, কবে তৈরি, কবে ব্যবহৃত (`usedAt`), revoked কিনা
- **sessions** — session token-এর হ্যাশ, কোন account, কোন scope, কখন expire হবে

`inMemoryDb` / `inMemorySessionDb` এখন শুধু লোকাল টেস্টের জন্য — প্রোডাকশনে নিজের ডেটাবেজ দিয়ে বদলে দিন। **গুরুত্বপূর্ণ:** key একবারই ব্যবহার হতে পারবে এটা নিশ্চিত করতে `markKeyUsed`-এর মতো ফাংশনটা আপনার ডেটাবেজে একটা **atomic** অপারেশন হতে হবে (যেমন SQL-এ `UPDATE ... WHERE used_at IS NULL`), যাতে দুটো সমান্তরাল রিকোয়েস্ট একই key দিয়ে দুইবার সফল না হয়।

### ধাপ ৪ — discovery route যোগ করা
**Next.js হলে:**
`app/.well-known/ai-access.json/route.js` ফাইল বানান, `middleware/nextjs.js`-এর `aapDiscoveryResponse()` ব্যবহার করে। `examples/ai-access.json`-এর মতো করে `site`, `description`, `endpoints`, `rate_limit`, এবং নতুন `auth` অবজেক্ট (single-use key + session মডেল বর্ণনা করে) পূরণ করুন।

**Express হলে:**
`middleware/express.js`-এর `aapDiscovery()` একইভাবে বসান (একই `auth` অবজেক্ট শেপ)।

### ধাপ ৫ — redeem route + প্রোটেক্টেড টাস্ক endpoint(গুলো) বানানো
`middleware/nextjs-key-routes.js`-এর গ্রুপ (B) আর (C) অনুসরণ করুন:
- **একটা পাবলিক redeem route** (`/api/ai-access/session`) — এখানে AI তার one-time raw key পাঠায়, বিনিময়ে একটা session token পায়। এই route-এ সাইটের normal login-চেক থাকবে না (কারণ বহিরাগত AI এটা কল করছে, সাইটে সাধারণভাবে লগইন করে না), কিন্তু key সঠিক/অব্যবহৃত/unrevoked হতে হবে।
- ধাপ ২-এ ঠিক করা প্রতিটা কাজের জন্য একটা **টাস্ক endpoint** (যেমন `/api/ai-access/classes`), যেটা raw key না, বরং **session token** (`X-AAP-Session` হেডার) চেক করে — `validateSession()` দিয়ে।

সব endpoint সবসময় **JSON রেসপন্স** দেবে — কখনো HTML লগইন পেজে redirect করবে না, এটাই AI-এর জন্য এটাকে নির্ভরযোগ্য করে।

### ধাপ ৬ — key জেনারেট করার UI বসানো (রেডি করা আছে, শুধু জোড়া লাগাতে হবে)
আলাদা করে বানাতে হবে না — তিনটা রেডি ফাইল দেওয়া আছে:

1. **`middleware/keyStore.js`** — key জেনারেট/validate/revoke করার লজিক, hashing সহ (raw key কখনো স্টোর হয় না)। এর ভেতরের `inMemoryDb` শুধু লোকাল টেস্টের জন্য — প্রোডাকশনে এটা আপনার নিজের ডেটাবেজ দিয়ে বদলে দিন (ফাইলের ভেতরে কোথায়/কীভাবে বদলাবেন তা মন্তব্য করে বলা আছে)।
2. **`middleware/nextjs-key-routes.js`** — `keyStore.js` ব্যবহার করে পাঁচটা রুট, তিনটা গ্রুপে ভাগ করা:
   - **(A) অ্যাডমিন রুট** — key তৈরি/লিস্ট/revoke (`app/api/ai-access/keys/route.js`, `app/api/ai-access/keys/[id]/route.js`)। **এগুলো অবশ্যই সাইটের স্বাভাবিক লগইন-চেকের পেছনে থাকতে হবে** (`requireUserSession` জায়গায় নিজের auth বসান) — key জেনারেট করা একটা account-level অ্যাকশন।
   - **(B) redeem রুট** — `app/api/ai-access/session/route.js`, পাবলিক (সাইট-লগইন ছাড়াই), কিন্তু শুধু সঠিক/অব্যবহৃত key দিয়েই কাজ করে।
   - **(C) টাস্ক endpoint(গুলো)** — আপনার বাকি endpoint, session token চেক করে।
3. **`examples/AdminKeyPanel.jsx`** — একটা রেডি React কম্পোনেন্ট, যেটা সরাসরি আপনার সেটিংস/অ্যাডমিন পেজে বসিয়ে দিলেই "Generate Key" বাটন, key-লিস্ট, আর Revoke বাটন সহ একটা পুরো প্যানেল চলে আসবে। শুধু `<AdminKeyPanel />` ইম্পোর্ট করে বসান।

এই তিনটা ফাইল একসাথে বসালে অ্যাডমিন প্যানেলে সত্যিকারের, কাজ-করা "Generate AI Access Key" অপশন চলে আসবে — কোড নতুন করে লিখতে হবে না, শুধু আপনার ডেটাবেজ আর auth-এর সাথে জোড়া লাগাতে হবে।

### ধাপ ৭ — টেস্ট করা
```bash
# ১) discovery ফাইল
curl https://your-site.com/.well-known/ai-access.json

# ২) key redeem করে session নেওয়া
curl -X POST -H "X-AAP-Key: <generated-key>" https://your-site.com/api/ai-access/session

# ৩) session দিয়ে আসল endpoint কল করা
curl -H "X-AAP-Session: <session-token-from-step-2>" https://your-site.com/api/ai-access/classes

# ৪) একই key দিয়ে আবার ধাপ ২ রিপিট করে দেখুন — এবার 401 আসা উচিত
curl -X POST -H "X-AAP-Key: <same-generated-key>" https://your-site.com/api/ai-access/session
```
ধাপ ৪-এ `401` না এলে বুঝবেন single-use লজিকে বাগ আছে — ধাপ ৩ (atomic `markKeyUsed`) আবার চেক করুন।

### ধাপ ৮ — কেন্দ্রীয় Control Panel-এর সাথে যুক্ত করা (ঐচ্ছিক, কিন্তু রেকমেন্ডেড)
যদি আপনার টিম **Package 3 (aap-control-panel)** আলাদাভাবে হোস্ট করে থাকে, তাহলে এই সাইটটাকে তার সাথে যুক্ত করুন — এতে আপনার টিম দেখতে পারবে কোন সাইট কতবার ব্যবহার হচ্ছে, এবং দরকারে সাইটটাকে ব্লক/force-update করতে পারবে।

1. Control panel-এর ড্যাশবোর্ডে গিয়ে "Register Site" দিয়ে এই সাইটের domain যোগ করুন — একটা `siteKey` পাবেন (এটা AI-কে দেওয়া AAP key থেকে আলাদা জিনিস)
2. এই সাইটের env variable-এ যোগ করুন:
   ```
   CONTROL_SERVER_URL=https://control.yourco.com
   CONTROL_SITE_KEY=ctrl_xxxxxxxx...
   PACKAGE_VERSION=1.0.0
   ```
3. `middleware/telemetry.js`-এর `reportAccess()` আর `checkControlStatus()` ইতিমধ্যে `nextjs-key-routes.js`-এর (B) অংশে integrate করা আছে — আলাদা কোড লিখতে হবে না
4. `(D)` অংশ অনুযায়ী `app/api/ai-access/update-status/route.js` বানান, যাতে `examples/AdminKeyPanel.jsx`-এর "নতুন ভার্সন এসেছে" ব্যানারটা কাজ করে

**মনে রাখবেন:** control server অফলাইন/unreachable হলেও এই সাইটের AI access স্বাভাবিকভাবে চলতে থাকবে (fail-open ডিজাইন) — শুধু telemetry/ব্লক-চেক স্কিপ হয়ে যাবে। শুধু control server থেকে স্পষ্টভাবে `blocked: true` বা `forceUpdateRequired: true` আসলেই অ্যাক্সেস বন্ধ হবে।

## নিরাপত্তা চেকলিস্ট (ডিপ্লয় করার আগে নিশ্চিত করুন)
- [ ] raw key বা raw session token কোথাও প্লেইনটেক্সটে স্টোর হচ্ছে না (শুধু হ্যাশ)
- [ ] একই raw key দুইবার redeem করার চেষ্টা করলে দ্বিতীয়বার সবসময় `401` আসে (race condition-সহ — একসাথে দুইটা রিকোয়েস্ট পাঠিয়েও টেস্ট করুন)
- [ ] session token-এর একটা যুক্তিসঙ্গত TTL আছে (ডিফল্ট ৩০ মিনিট) এবং মেয়াদ শেষে endpoint `401` দেয়
- [ ] প্রতিটা key নির্দিষ্ট endpoint/account-এ scoped, পুরো অ্যাকাউন্টে না
- [ ] Rate limiting চালু আছে (per-key/per-session)
- [ ] ভুল/মেয়াদোত্তীর্ণ/ইতিমধ্যে-ব্যবহৃত key বা session দিলে সবসময় JSON `401`, কখনো HTML redirect না
- [ ] Key revoke করার উপায় আছে সাইটের নিজের সেটিংস থেকে
- [ ] যে endpoint-গুলো এক্সপোজ করা হয়েছে, সেগুলো সত্যিই AI-কে দেওয়া দরকার কিনা আরেকবার যাচাই করা হয়েছে

সেটআপ শেষ হলে, এই একই সাইটের জন্য **Package 2 (AI Access Skill)** ব্যবহারকারী AI-কে দিন, সাথে জেনারেট করা key — সে নিজে থেকেই discovery ফাইল পড়ে সঠিকভাবে কানেক্ট করে নেবে।
