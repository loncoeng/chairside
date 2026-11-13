# Design

Booking and customer records for one hair salon in Macau — an invented one,
built as if to replace a spreadsheet that had grown a few macros.

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

Registering a departure also **says how many future bookings still carry
that person's name.** Skip it and the gap is discovered on the day, at the
chair. The shop decides who takes each one over; nothing is reassigned for
them.

The last owner cannot be demoted or marked as left. Nobody would be left who
could open the settings to undo it.

### A bill belongs to the stylist, not to whoever went first

A visit is several treatments and they are not all done by the same person.
The obvious rule — credit whoever did the first one — puts the month's takings
on the assistant, because the first treatment is nearly always the shampoo and
the assistant is nearly always the one doing it.

It looked right. Every stylist had a number, the numbers added up to the
month's total, and the assistant was quietly top of the list with three times
anybody else's. Nothing about the screen said anything was wrong.

So the bill goes to whoever did the treatment the guest came in for: the first
one that occupies a styling chair. A wash on its own still belongs to the
person who did it — somebody who only comes in for a shampoo was served by
that person and nobody else.

Splitting a bill between the stylist and the assistant would need a rule the
shop has not been asked for, a share or a price per line, and inventing one
would put numbers on a payslip that nobody agreed to. The rule is in
`src/db/credit.ts` with six tests, rather than inside a join condition where
nobody would find it.

### The shop sets the exchange rate

MOP, HKD, CNY. Most shops in Macau work at 1:1:1; 1:1.03 turns up
occasionally. **That is a shop policy, not a market rate**, so nothing needs
to be fetched from an exchange API.

Each payment copies the rate that was configured at the moment it was taken.
Change the rate later and **past takings stay where they were.** A record of
money received must not move after the fact.

With no external call, this also works offline.

### Money is whole cents

Every amount is an integer number of cents, and every rate an integer number
of basis points (10,000 is 1:1). In floating point, ten payments of 0.10 do
not make 1.00, and a month of takings is a long sum. The decimal point
appears in two places only: reading what was typed at the till, and showing
an amount (`src/db/money.ts`). A foreign payment is converted at its own rate
and rounded once, to the cent, before it is added to anything.

The first version stored REAL. `migrations/0006_money_in_cents.sql` moved
every value across, rounding each to the nearest cent, and the totals before
and after were compared on the full sample: 2,825 payments, not a cent apart.

### Writes land whole, and the later of two collisions withdraws

A booking is a row, its treatments and a line of history. Written one at a
time, a failure halfway leaves a booking with nothing in it. They go together
(`src/db/atomic.ts`): D1's `batch()` is its transaction, and sql.js has an
ordinary one.

That does not stop two people booking the same stylist at the same moment.
D1 cannot hold a transaction open while JavaScript runs the rules, so both
requests can pass the check before either writes. Each write is therefore
checked once more after it lands, against bookings with a lower id only. Of
two that collide, the higher id withdraws and the lower stands, and the
answer is the same whichever looks first. The one that withdraws comes back
409, as if it had lost the first check.

A payment carries a key the till picks each time it opens. Press the button
twice, or retry after a lost reply, and the second is recognised and records
nothing.

Bringing a cancelled booking back is checked too. While it was cancelled,
its stylist's time may have gone to somebody else.

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

### One schema, two places to run it

Cloudflare D1 is SQLite underneath, so **the same schema and the same queries
run in both environments.**

| | Purpose | Driver |
|---|---|---|
| Cloudflare Workers + D1 | The shop's production | `drizzle-orm/d1` |
| SQLite compiled to WASM, in the browser | The public demo | `drizzle-orm/sql-js` |

Queries take a database handle as an argument, so only the call site changes.
**The demo does not get its own copy of the interface.** The tests run the
real router on sql.js, so a query that only works on D1 fails one.

A shop that would rather keep everything on one PC could add a third driver
for a SQLite file the same way. It has not been built, because nobody has
asked for it.

Choosing MySQL or PostgreSQL here would close off the browser demo.

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

The token only says who somebody is. Whether they still work here, and in
what role, is read from the staff table on every request: one indexed lookup,
and a departure or a demotion applies at once. The first version trusted the
role inside the token and let a departed stylist keep working for up to
twelve hours.

Every write must say it is JSON. A form on another site can POST, but only as
form data or plain text, so such a request is refused before anything reads
it, whatever SameSite does in a given browser. The cookie is `__Host-`, so
nothing on another subdomain can set it, and the signing key must be at least
32 characters or nobody can sign in at all.

Failed sign-ins are counted in the database, per address and per login id.
The first version counted them in the Worker's memory, which is per instance:
an attacker spread across instances got five tries on each.

The demo signs in for real, through the same screen and the same
`POST /api/session`. A demo that went round the login would be showing
something the shop does not run, and whether the login exists at all is what a
reader most wants to check. It simply knows the password, which is printed on
the page: that database is invented and lives in the visitor's browser.

**The accounts are not in the live database.** They are built into the demo's
file (`seed/logins.sql`, applied by `scripts/build-demo-db.ts` and deliberately
not by the deploy), so the published password opens the demo and nothing else.
The first version did put them in D1, which meant anybody who read the README
could sign in as the owner and write into a database every later visitor
reads — including a shop being shown the thing. The check after each deploy
now asserts that the published password comes back 401, and signs its own
token with the key it already holds instead (`scripts/mint-session.ts`).

**Cookies do not work inside a page, in either direction.** Two releases went
out learning this, one per direction, and Node reproduces neither.

**A page cannot put `Set-Cookie` on a Response it builds.** The name is
forbidden on response-guarded headers, so the browser drops it at construction
and says nothing. The demo learned its session by reading that header, so it
could not sign in at all.

**A page cannot put `Cookie` on a Request it builds either.** Also forbidden,
also dropped in silence. With the first fixed, the demo signed in, minted a
token, set it on the next request — and the browser removed it. Everything
after the sign-in came back 401, and the app returned to the sign-in screen
after showing the booking screen for a frame. Both times every test passed and
the deploy was green.

So the token is kept as a plain string and handed to `route()` as an argument.
It changes where the token comes from and nothing about what is done with it:
`read()` checks the signature and the expiry either way, and one handed in that
does not verify gets exactly as far as one that arrived in a header. The Worker
never passes it — production sends a real HttpOnly cookie over the network,
where the browser applies it.

`src/ui/demo.test.ts` now takes both rules away: every reply loses
`Set-Cookie` and every request loses `Cookie`, which is what a browser does to
a Response and a Request a page built. `src/ui/app.test.ts` drives the whole
screen through the same conditions. Making the router ignore the argument fails
four of them.

**The demo is the front door.** It was behind a button in the header that only
appeared once you were signed in, which made it unreachable for the one person
it was built for. Now it is the large button on the first screen and the shop's
own sign-in is underneath, empty.

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

A month's takings are read as rows, about 1,700 of them, and summed in the
Worker, because whose name goes on a bill is a rule with its own tests
(`src/db/credit.ts`) rather than something to bury in a join. That is well
inside a Worker's CPU budget. Ten years in one report would not be, and would
be summed in SQL first.

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

**A screen for passwords.** Giving somebody a login, and changing your own,
are done with `scripts/make-logins.ts` and a migration rather than from the
interface. For eight people who were all hired in person this is a handful of
minutes a year, and a password screen is a place to leak one — an old password
field that echoes, a reset flow that mails a token, an account somebody forgot
to close. It is the next thing to build if the shop grows, and the hashing it
would need is already there (`src/db/session.ts`).

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
