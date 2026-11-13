# migrations

Generated from [`../src/db/schema.ts`](../src/db/schema.ts) by `drizzle-kit`,
and committed. Cloudflare applies them with `wrangler d1 migrations apply`.

```sh
npx drizzle-kit generate   # after editing the schema
```

The `.sql` files are the source of truth for D1, the browser demo and the
tests. `meta/` is drizzle's own snapshot; it
is what lets the next `generate` emit a diff instead of the whole schema again,
so it is committed too.

**Names get changed by hand.** drizzle picks a random one
(`0000_colossal_zuras`), which says nothing about what the migration does. The
tag in `meta/_journal.json` has to be changed to match, or the next `generate`
loses track.
