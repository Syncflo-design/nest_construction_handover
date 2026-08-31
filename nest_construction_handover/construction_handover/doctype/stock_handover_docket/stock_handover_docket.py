"""Stock Handover Docket.

A docket is a signed record of one person handing stock to another. It is NOT
the stock movement. The movement is posted separately, once the docket is
complete and the server can validate it -- which is what lets the capture
happen with no signal.

Direction, project and site are all derived here rather than chosen by the
user, so nobody can tag a handover to the wrong job at a tailgate.
"""

import frappe
from frappe.model.document import Document

# (from role, to role) -> direction label. Anything else is "Other", which is
# allowed but flagged: it means someone has wired up an unusual route.
ROLE_FLOW = {
	("Main Store", "Van"): "Store to Van",
	("Van", "Site Store"): "Van to Site",
	("Site Store", "Van"): "Site to Van",
	("Van", "Main Store"): "Van to Store",
}


class StockHandoverDocket(Document):
	def validate(self):
		self.set_direction()
		self.set_project_and_site()
		self.default_received_quantities()
		self.set_status()

	def set_direction(self):
		"""Derived from each warehouse's handover_role, never from its name.

		The original prototype matched warehouse names with a regex, which
		broke the moment a warehouse was renamed.
		"""
		roles = (
			frappe.db.get_value("Warehouse", self.from_warehouse, "handover_role"),
			frappe.db.get_value("Warehouse", self.to_warehouse, "handover_role"),
		)
		self.direction = ROLE_FLOW.get(roles, "Other")

	def set_project_and_site(self):
		"""Project and site come from whichever end of the leg is a site.

		A delivery takes them from the destination, a return from the source.
		Store-to-van and van-to-store legs have neither, and a blank project
		there is correct -- that stock is not on a job yet.
		"""
		# TODO: Project Site is still a client-side custom child table. It
		# should move into this app before a second tenant installs it.
		if not frappe.db.exists("DocType", "Project Site"):
			return

		for warehouse in (self.to_warehouse, self.from_warehouse):
			row = frappe.db.get_value(
				"Project Site",
				{"site_store_warehouse": warehouse},
				["parent", "site_label"],
				as_dict=True,
			)
			if row:
				self.project = row.parent
				self.site_label = row.site_label
				return

		self.site_label = None

	def default_received_quantities(self):
		"""Until the receiver signs, show the sent quantity as the expected
		count. Once they have signed, whatever they counted stands."""
		if self.received_by:
			return
		for item in self.items:
			if not item.qty_received:
				item.qty_received = item.qty_sent

	def set_status(self):
		"""Open until both parties have signed. Posted/Failed/Cancelled are
		set by the posting routine and are not recomputed here."""
		if self.status in ("Posted", "Failed", "Cancelled"):
			return
		self.status = "Complete" if (self.given_by and self.received_by) else "Open"
