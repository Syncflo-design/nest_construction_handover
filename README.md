# Nest Construction Handover

Two-signature stock handover dockets for field operations: main store to van,
van to site, and back again.

## The idea

A handover is recorded as a **docket** — a signed note of what one person handed
to another — not as a stock movement. The docket is captured the moment the
exchange happens, with or without signal. The stock movement is posted
afterwards, when the server can validate it.

This is what a paper docket book already does, and it is the only model that
survives having no coverage at a site.

## Why not post directly

ERPNext owns FIFO valuation and stock validity server-side, so a phone cannot
know whether the stock is still there. Two site users can each draw 40m from a
van holding 50m while both are offline; one of those dockets must fail on sync.
That is a business exception, not a merge conflict, and it surfaces in the main
storeman's queue.

## Model

- **Stock Handover Docket** — one docket, two signature slots (given / received).
  Complete when both are filled. Posts to a Stock Entry, or lands as `Failed`
  with the reason.
- **Stock Handover Docket Item** — `qty_sent` is what the giver listed,
  `qty_received` is what the receiver counted. The received quantity is what
  posts.
- `docket_id` is generated on the device and is unique, so the same handover
  cannot post twice however many times it syncs.

## Configuration

Installing adds two custom fields:

- `Warehouse.handover_role` — **Main Store**, **Van** or **Site Store**. This
  drives who may hand stock to whom, and the docket's direction is derived from
  it. Warehouse *names* are never parsed.
- `User.custom_handover_pin` — four digits, used to sign a docket. It is a
  signature, not a login credential: offline it can only ever be a ceremony,
  which is the same standing a signature on a paper docket has.

## Status

Early. The docket model and its derivations are in place. Signing, posting and
the offline capture layer are still to come.
