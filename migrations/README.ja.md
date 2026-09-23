# migrations

[`../src/db/schema.ts`](../src/db/schema.ts) から `drizzle-kit` が起こした SQL
で、生成物ごとコミットしています。Cloudflare には
`wrangler d1 migrations apply` で当てます。

```sh
npx drizzle-kit generate   # スキーマを変えたあとに
```

`.sql` が3つの環境すべての原本です。D1、ローカルの SQLite ファイル、ブラウザ
のデモが同じものを読みます。`meta/` は drizzle 自身の控えで、次回の生成を
差分だけに留めるために必要なので、これもコミットします。

**ファイル名は手で直します。** drizzle は `0000_colossal_zuras` のような
でたらめな名前を付けるので、何の変更なのかが分かりません。名前を変えたら
`meta/_journal.json` の tag も揃えます。揃えないと次回の生成が追跡を失います。
