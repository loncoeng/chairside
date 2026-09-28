# Design

Booking and customer records for one hair salon in Macau, replacing a
spreadsheet that had grown a few macros.

**It is not a general booking system.** That ground is already held by mature
open-source projects, and arriving late only produces a thinner version of
them. Building for one shop instead buys something better: every feature left
out can be named, with the reason.

---

## Decisions

### Seats are not interchangeable

Nine styling chairs, three shampoo stations, eight stylists. Counting them
shows that **the ceiling is different for each kind.**

| | Count | What actually happens |
|---|---|---|
| Styling chairs | 9 | Only one more than there are stylists. During a colour's processing time a stylist starts another guest, so one person occupies two chairs |
| Shampoo stations | 3 | 47% utilisation across a day, but arrivals cluster in the evening and at weekends, and three stations are then contested |

Holding both as one undifferentiated "seat" erases that difference.
`seats.kind` separates them, and each service records which kind it needs.

### Some conflicts stop a booking; others only warn

| | Treatment |
|---|---|
| One stylist, two bookings at the same time | **Stop.** Plainly wrong |
| A tenth styling chair | **Warn.** There are nine, but a short wait absorbs it |
| Four shampoos overlapping | **Warn.** Five minutes of staggering solves it |

Bookings arrive by WeChat and by phone and get typed in while the caller is
still on the line. **A system that refuses cannot be used that way.** The
person at the desk knows the room.

This is the split flex-guard makes between `error` and `warning`. Fold
"cannot be sent" together with "will be sent but look wrong" and people
silence the warnings by switching the whole check off.

### Departed staff are never deleted

People come and go here. **Deleting a stylist removes them from bookings that
already happened, and per-stylist revenue stops adding up.** `joined_on` and
`left_on` mark who is currently on the team; everyone else simply stops
appearing as a choice on new bookings.

Registering a departure also **lists that person's future bookings and asks
who takes them over.** Skip it and the gap is discovered on the day, at the
chair. Unglamorous, and the single most useful thing in daily use.

### The shop sets the exchange rate

MOP, HKD, CNY. Most shops in Macau work at 1:1:1; 1:1.03 turns up
occasionally. **That is a shop policy, not a market rate**, so nothing needs
to be fetched from an exchange API.

Each payment copies the rate that was configured at the moment it was taken.
Change the rate later and **past takings stay where they were.** A record of
money received must not move after the fact.

With no external call, this also works offline.

### Holidays are imported, not computed

Macau, Hong Kong and mainland holidays all belong on the calendar, because
each shifts who walks in.

`date-holidays` covers 207 countries and **omits Macau.** Nager.Date has no
Macau either, and returns six entries for China where the real figure is
around fifteen. **Google's calendar feeds are the only source covering all
three**, and they carry 2021 through 2031, so they are imported once a year.

Nothing calls Google at run time. An outage would empty the calendar, and the
application would stop working offline. The source and the date it was
fetched are stored alongside the data.

**When the data runs out it must not go quietly.** Entering a year with no
holidays on file puts a notice on screen.

### One schema, three places to run it

Cloudflare D1 is SQLite underneath, so **the same schema and the same queries
run in all three environments.**

| | Purpose | Driver |
|---|---|---|
| Cloudflare Workers + D1 | The shop's production | `drizzle-orm/d1` |
| Node + a SQLite file | If the shop would rather keep it on one PC | `drizzle-orm/better-sqlite3` |
| SQLite compiled to WASM, in the browser | The public demo | `drizzle-orm/sql-js` |

Queries take a database handle as an argument, so only the call site changes.
**The demo does not get its own copy of the interface.**

Choosing MySQL or PostgreSQL here would close off both the on-premise option
and the browser demo.

### The demo shares nothing

Each visitor's data lives in their own browser and never reaches a server.

- Costs nothing to run
- Cannot be vandalised, because there is no shared state
- Nobody arrives to find what the last visitor typed
- Reloading restores it

**There is no path at all between it and the shop's records.**

---

### The API was open, and this is how it closed

Stages one to seven were built without a sign-in. At the end of stage seven
the live instance was probed from outside. `GET /api/people` returned fifty
guests with their phone numbers. `POST /api/records` appended to a guest's
notes and came back 201. `PUT /api/shop/hours` rewrote the opening times.

Nothing was injectable and nothing was cross-scriptable — every query goes
through a placeholder, and the interface never builds HTML out of a string.
The hole was simpler than either: nobody was ever asked who they were.

The check sits in the router, once, rather than in each handler
(`src/worker/router.ts`). A permission you have to remember to add is a
permission the next endpoint goes without, and the endpoint that went without
it is a customer list on the open internet. Roles are a table of path patterns
(`src/db/permissions.ts`), so what an owner can reach and a stylist cannot is
six lines anybody can read.

The role travels inside the signed token, so a demotion takes up to twelve
hours to bite. For a shop of eight that is the right side of the trade; for
eighty it would not be.

The demo signs in for real. It shows the same screen, with the details filled
in and printed underneath it, because a demo that skipped the login would be
showing something the shop does not run — and whether the login exists at all
is the thing a reader most wants to check. There is nothing to protect: that
database is invented and lives in the visitor's browser.

## Free tier

Calculated for eight stylists and 56 visits a day.

| | Used | Limit | |
|---|---|---|---|
| Worker requests | 1,296 | 100,000 | 1.3% |
| D1 rows written | 448 | 100,000 | 0.45% |
| D1 rows read | 259,200 | 5,000,000 | 5.2% |

Five years of accumulation comes to roughly 170MB against a 5GB limit.

**One condition attaches.** D1 counts rows the engine *examined*, not rows
returned, so the calendar is indexed on date and stylist. Without those
indexes the first year runs fine and the third year stops abruptly.

Aggregation happens in SQL. A Worker gets 10ms of CPU per invocation, which
summing in JavaScript will exceed.

---

## Not built

**Online booking by customers.** Enquiries arrive on WeChat and by phone.
Building it now drags in accounts, published availability and abuse
handling, and triples the size of the thing.

It is not walled off, though. Bookings record **who entered them**, and
availability is calculated by a standalone function, so adding a public
route later is an addition rather than a rewrite.

**Deposits and cancellation fees.** The shop does not take them.

**Product stock.** Stock counts drift the moment anyone stops recording
movements, and a number that disagrees with the shelf is worse than no number.

**WeChat integration.** No API exists for reading a personal WeChat account,
and automating one violates the terms and gets the account closed. A verified
Service Account does expose an API — available to Macau-registered businesses
without a mainland licence — but that starts with the shop deciding to move
customers to a different address.

**LINE integration.** Straightforward to build and of little use here; few
customers in Macau are on it. Notification targets are kept abstract and
nothing is wired up.

---

## Personal data

This holds customer names, contact details and treatment history. Macau's
Personal Data Protection Act (Lei n.º 8/2005) follows the European model,
and a business processing such data automatically must notify the Office for
Personal Data Protection — free of charge. That obligation is the shop's, not
this software's.

**No real data enters the repository.** Code, schema, and entirely invented
samples. Not "a real customer with the details changed."

CI runs `publish-guard verify` so that a shop name, a person's name or an
address cannot reach the history unnoticed.

---

> The code comments in this repository are in English. The Japanese design
> notes live in [DESIGN.ja.md](DESIGN.ja.md).
