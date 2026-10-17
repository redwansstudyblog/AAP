# AAP Control Panel — Vercel deployment bundle

এই ফোল্ডারটা `packages/control-panel`-এর Vercel-এর জন্য rebuild করা একটা ভার্সন (serverless function আকারে, `app.listen()` ছাড়া)। Vercel প্রজেক্টের **Root Directory** এই ফোল্ডারে (`deploy/control-panel`) সেট করা থাকলে `main` ব্রাঞ্চে push হওয়ার সাথে সাথেই এটা অটো-ডিপ্লয় হবে।

## প্রথমবার সেটআপ (Vercel ড্যাশবোর্ডে)
1. প্রজেক্ট → **Settings → General → Root Directory** → `deploy/control-panel` বসান, Save
2. প্রজেক্ট → **Settings → Environment Variables** → নতুন ভ্যারিয়েবল:
   - Key: `ADMIN_TOKEN`
   - Value: (একটা লম্বা র‍্যান্ডম স্ট্রিং — যেকোনো পাসওয়ার্ড জেনারেটর দিয়ে বানান, কাউকে শেয়ার করবেন না)
   - Target: Production, Preview, Development সব কটা টিক দিন
3. Save করার পর **Deployments** ট্যাবে গিয়ে সর্বশেষ ডিপ্লয়মেন্টে "Redeploy" চাপুন (প্রথমবার env var অ্যাড করার পর রিডিপ্লয় লাগে)

## সতর্কতা
`db.js` একটা in-memory storage — Vercel serverless function রিস্টার্ট/নতুন ইনস্ট্যান্সে ডেটা হারিয়ে যেতে পারে। রিয়েল ইউজের আগে এটাকে একটা আসল ডেটাবেজ (Postgres, Vercel KV ইত্যাদি) দিয়ে বদলে নিন।
