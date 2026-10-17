# AAP — AI Access Protocol

**একটা ছোট, খোলা standard, যা দিয়ে যেকোনো ওয়েবসাইট AI এজেন্টদের জন্য একটা নিরাপদ, documented দরজা খুলে দিতে পারে — real login password ছাড়াই, ব্রাউজার-অটোমেশনের ঝুঁকি ছাড়াই।**

> A small, open standard that lets any website open a safe, documented door for AI agents — no real login password, no browser-automation risk.

---

## সমস্যাটা কী

AI এজেন্টদের (Claude, বা অন্য কোনো AI) প্রায়ই কোনো login-protected ওয়েবসাইটে ঢুকে কাজ করতে হয় — রিভিউ করা, টেস্ট করা, ডেটা আনা। এর সাধারণ সমাধান হলো AI-কে real username/password দিয়ে দেওয়া, অথবা ব্রাউজার দিয়ে লগইন ফর্ম অটোমেট করা — দুটোই ভঙ্গুর আর ঝুঁকিপূর্ণ।

**AAP এর বদলে একটা standardized, single-use key দেয়**, যেটা একবার ব্যবহার হয়ে একটা সাময়িক session-এ বদলে যায় — অনেকটা ইমেইলের "ম্যাজিক লগইন লিংক"-এর মতো।

## কীভাবে কাজ করে (৩০ সেকেন্ডে)

```
1. ওয়েবসাইট মালিক একটা key জেনারেট করে, AI-কে দেয়
2. AI সেই key একবার "redeem" করে একটা সাময়িক session পায় (৩০ মিনিট)
3. AI সেই session দিয়ে কাজ করে — ডেটা দেখা, টেস্ট করা, ইত্যাদি
4. session শেষ হলে অ্যাক্সেসও শেষ — পরের বার নতুন key লাগবে
```

এটা তিনটা স্বতন্ত্র প্যাকেজে ভাগ করা, কারণ এতে কাজ করা তিনজন ভিন্ন মানুষ/ভিন্ন সময়ে এটা ব্যবহার করে:

| # | প্যাকেজ | কার জন্য | কী করে |
|---|---|---|---|
| 1 | [`packages/site-setup`](./packages/site-setup) | ওয়েবসাইট মালিক / ডেভেলপার | নিজের সাইটে AAP বসানো — discovery route, key system, admin UI |
| 2 | [`packages/ai-access-skill`](./packages/ai-access-skill) | যে AI দিয়ে অন্য সাইটে কাজ করাবেন | AI-কে দেওয়ার স্কিল — AAP থাকলে সেটা ব্যবহার করে, না থাকলে ফলব্যাক |
| 3 | [`packages/control-panel`](./packages/control-panel) | আপনার টিম (অ্যাডমিন) | কোন সাইট কতবার ব্যবহার হচ্ছে দেখা, ব্লক করা, নতুন ভার্সন পাবলিশ করা |

## কোথা থেকে শুরু করবেন

**আপনি যদি একটা সাইটে AI-এর জন্য দরজা খুলতে চান** → [`packages/site-setup/SETUP.md`](./packages/site-setup/SETUP.md) খুলুন, ধাপে ধাপে অনুসরণ করুন।

**আপনি যদি কোনো AI-কে একটা সাইটে কাজ করাতে চান** → [`packages/ai-access-skill/README.md`](./packages/ai-access-skill/README.md) খুলুন।

**আপনি যদি সব সাইট মনিটর/কন্ট্রোল করতে চান** → [`packages/control-panel/README.md`](./packages/control-panel/README.md) খুলুন।

## ডিজাইনের মূলনীতি

- **Single-use key** — একটা key একবারই কাজ করে, তারপর মরে যায়
- **Scoped access** — AI শুধু owner-এর এক্সপ্লিসিটলি দেওয়া endpoint-গুলোতেই ঢুকতে পারে, পুরো অ্যাকাউন্টে না
- **Fail-open monitoring** — কন্ট্রোল সার্ভার ডাউন থাকলেও কোনো সাইটের AI-access ভাঙবে না
- **কোনো silent remote code execution না** — নতুন ভার্সন এলে নোটিফিকেশন যায়, কোড নিজে বদলে যায় না; মানুষ রিভিউ করে ডিপ্লয় করে

## লাইসেন্স
MIT — স্বাধীনভাবে ব্যবহার, পরিবর্তন করুন।
