# Nest Construction Handover

Stock handovers for field operations: main store to van, van to site, and back
again, plus what was used on site. One phone screen, **Van & Site Stock**
(`/desk/van-site-stock`).

## The idea

A handover is recorded as a **docket**: a note of what one person handed to
another. The giver lists what is going; the receiver counts what arrived and
accepts it. Only then does stock move, as one Stock Entry for what was
counted. Whatever did not arrive stays where it was.

Stock never sits in limbo as a draft Stock Entry that somebody could submit
from the desk, and the docket keeps both counts (sent and received), so a
shortfall is on record.

## Who sees what

Driven by the warehouse on the user (**Assigned Warehouse**) and that
warehouse's **Handover Role**:

- **Main Store** (the storeman): send to a van, accept returns, what is in the store.
- **Van** (a technician): deliver to a site, used on site, back to the store,
  what is in each part of the van, accept deliveries and returns.
- **Site Store** (a site): used on site, back on a van, what is on site, accept
  deliveries. A site manager (Project Site) also works every site they manage.
- Everyone: find stock (how much, and where).

Stock Manager / System Manager with no Assigned Warehouse work as the main
store, and can withdraw a handover that is stuck. Nobody can accept on behalf of
the place it was sent to.

## Rules

- A van is a group warehouse with four compartments (**Van Category**): Goods
  In Transit, Technician Tools, Assets, Van Stock. Project stock sent to a van
  goes into Goods In Transit automatically; anything else goes where that item
  went last time, unless the storeman picks another compartment.
- Leaving a van, each line says which compartment it comes out of; project stock
  first.
- Stock listed on an open docket is spoken for: it cannot be sent or used twice.
- A docket going to or from a site takes that site's project.
- **Used on site** is a Material Issue from the site store against the site's
  project, which is what costs the job.
- Serial- or batch-tracked items are refused on this screen; move them from the
  desk, where the numbers can be picked.
- Every Stock Entry is built and submitted with the user's own permissions:
  everyone using the screen needs **Stock User** (sites included).

## Model

- **Stock Handover Docket**: from, to, project, given by / at, received by / at,
  status Open → Posted (accepted) or Cancelled (turned down or withdrawn), and
  the Stock Entry it posted.
- **Stock Handover Docket Item**: `qty_sent` is what the giver listed,
  `qty_received` what the receiver counted (this is what posts). `s_warehouse`
  / `t_warehouse` are the van compartments where a line leaves or enters a van.
- `docket_id` is generated on the phone and is unique, so a second tap on Send
  cannot make a second docket.

## Configuration

Installing (and every migrate) adds these custom fields:

- `Warehouse.handover_role`: **Main Store**, **Van** or **Site Store**.
  Warehouse *names* are never parsed.
- `Warehouse.van_category`: which of a van's compartments a warehouse is.
- `User.custom_assigned_warehouse`: the store, van (the group) or site a user
  works from.
- `User.custom_handover_pin`: reserved for signing dockets when offline capture
  comes; not used by the screen yet.

Sites and their projects come from `nest_project_sites` (Project → Sites).

## Not yet

Online only: each step records when the button is tapped. Offline capture and
signatures are the next phase; the docket model is built for them.
