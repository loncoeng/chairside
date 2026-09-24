# migrations

[`../src/db/schema.ts`](../src/db/schema.ts) から `drizzle-kit` で生成した
SQL です。生成物ごとコミットしています。Cloudflare へは
`wrangler d1 migrations apply` で適用します。

```sh
npx drizzle-kit generate   # スキーマを変更したら実行する
```

この `.sql` が3環境すべての大元です。D1、ローカルの SQLite ファイル、
ブラウザのデモが同じものを読みます。`meta/` は drizzle が差分を計算する
ために使う控えなので、これもコミットしています。

**ファイル名は手で付け直してください。** drizzle は
`0000_colossal_zuras` のようなランダムな名前を付けるので、何の変更なのか
分かりません。リネームしたら `meta/_journal.json` の `tag` も合わせます。
ここがずれると、次回の生成で差分を追えなくなります。
