# chairside

*[日本語版 / Japanese version](README.ja.md)*

Booking and customer records for one hair salon in Macau — nine styling
chairs, three shampoo stations, and the three currencies the shop actually
takes.

Replacing a spreadsheet that had grown a few macros.

---

## Why not a general booking system

Search GitHub for `appointment-booking` and you get 652 repositories;
`reservation-system` returns 762. The ones at the top have had years to
mature. Arriving late with another general one produces a thinner version of
work already done well.

Narrowing to **one shop** buys something the general ones cannot have: every
feature left out can be named, with the reason. That list is in
[DESIGN.md](DESIGN.md), and it is the more interesting half of this
repository.

## What shapes the schema

**Counting the room first.** Nine styling chairs, three shampoo stations,
eight stylists. The ceiling is different for each, so they are not one kind
of seat:

| | Count | |
|---|---|---|
| Styling chairs | 9 | One more than there are stylists. During a colour's processing time one stylist occupies two |
| Shampoo stations | 3 | 47% utilisation across a day, but everyone arrives in the evening |

**Some conflicts stop a booking, others only warn.** One stylist in two
places at once is plainly wrong and gets refused. A tenth styling chair, or a
fourth overlapping shampoo, gets a notice — bookings are typed in while the
caller is still on the line, and a system that refuses cannot be used that
way. The person at the desk knows the room.

**Departed staff are never deleted.** Deleting one removes them from bookings
that already happened and breaks per-stylist revenue. Registering a departure
lists their future bookings and asks who takes them over, which is the
unglamorous part that matters most in daily use.

**The shop sets the exchange rate.** Most shops in Macau work at 1:1:1 and
1:1.03 turns up occasionally. That is a policy, not a market rate, so nothing
is fetched and each payment keeps a copy of the rate as it stood. Change the
rate later and past takings stay where they were.

## One schema, three places to run it

D1 is SQLite underneath, so the same schema and the same queries run
unchanged in all three:

| | Purpose | Driver |
|---|---|---|
| Cloudflare Workers + D1 | The shop's production | `drizzle-orm/d1` |
| Node + a SQLite file | If the shop would rather keep it on one PC | `drizzle-orm/better-sqlite3` |
| SQLite in the browser (WASM) | The public demo | `drizzle-orm/sql-js` |

The demo therefore shares nothing: each visitor's data lives in their own
browser, costs nothing to run, cannot be vandalised, and resets on reload.

## Building it in stages

Each stage ends with a deploy. Building the whole thing and shipping once at
the end leaves nothing standing when a step goes wrong partway.

- [x] **1 — Shell.** Deployed and reachable, no database yet
- [x] **2 — D1 and the schema.** The screen reads its rows off the database
- [x] **3a — The calendar.** A day as a grid, one column per seat
- [x] **3b — Taking a booking.** Refuse the impossible, say the rest out loud
- [x] **3c — Changing a booking.** Status, time and stylist; nothing is deleted
- [x] **4 — Customers and treatment records.** Who they are, and what their bookings add up to
- [x] **5 — Payments and revenue.** One button, and a month at a time
- [x] **6 — Holidays, opening hours, staff.** The settings, and the three regions' holidays
- [x] **7 — The public demo.** The same code, on SQLite in the browser

## Running it

```sh
npm install
npm run dev
```

`npm run dev` serves the interface on its own; the API needs the Worker, so
`npx wrangler dev` runs both together against a local copy of the database.

## The demo, and the instance

The page at the address above is the demo. Press **Open the demo** and the
whole shop loads into your own browser: SQLite compiled to WebAssembly, three
months of an invented salon, and the same router the Worker runs. Nothing is
sent anywhere, nobody else sees what you do, and a reload puts it back.

Underneath it is the sign-in a real shop uses, and **nothing opens it.** The
accounts live in the demo's database, not in the live one — so a visitor
cannot write into something the next visitor reads. A shop running this gets
its own Worker, its own database and passwords of its own.

## Signing in

Everybody who works in the shop has a login. Apart from the sign-in screen
and `/api/version`, nothing answers without one. The owner sees the takings
and the settings; a stylist does not.

A session is a signed token in an HttpOnly cookie, good for twelve hours, with
no row to look up. Passwords are PBKDF2-SHA256, 100,000 rounds, salted per
person.

The Worker needs a signing key before anybody can sign in:

```sh
npx wrangler secret put SESSION_SECRET
```

Without one, every sign-in comes back 503. That is deliberate. The other
behaviour — no key configured, so let them through — is the one that ships
with no key configured.

## Personal data

This holds customer names, contact details and treatment history. Macau's
Personal Data Protection Act (Lei n.º 8/2005) follows the European model, and
notifying the Office for Personal Data Protection is the shop's obligation,
not this software's.

**No real data enters this repository** — code, schema, and entirely invented
samples. CI runs `publish-guard verify` over the full history so that a name
or an address cannot slip in unnoticed. The forbidden terms arrive from a
secret rather than a committed file, because writing them down to forbid them
would publish them.

## Licence

MIT. See [LICENSE](LICENSE).
