"""Where each person lands when they open the desk on a phone.

Published to the desk as frappe.boot.nch_mobile_home and acted on by
public/js/nch_mobile.js, only on small screens and only when the desk opens on its
home page.
"""

import frappe

from nest_construction_handover.field import _approves, _whoami

FIELD_SCREEN = "/desk/van-site-stock"
APPROVALS = "/po-approvals"
PO_REQUEST = "/po-request"


def mobile_home():
	"""The phone screen for the signed-in person, or None to keep the home page.

	Admins (System Manager) always keep the home page. People with a store, van or
	site get Van & Site Stock; approvers the approval inbox; buyers PO Request.
	"""
	user = frappe.session.user
	if user in ("Guest", "Administrator"):
		return None

	roles = set(frappe.get_roles(user))
	if "System Manager" in roles:
		return None

	if _whoami():
		return FIELD_SCREEN

	if "nest_po_management" in frappe.get_installed_apps():
		if roles & {"Purchase Director", "Purchase Approver"} or _approves(user):
			return APPROVALS
		if "PO Requester" in roles:
			return PO_REQUEST

	return None


def boot_session(bootinfo):
	"""Never let a failure here stop the desk from loading."""
	try:
		bootinfo.nch_mobile_home = mobile_home()
	except Exception:
		frappe.log_error(title="nest_construction_handover: mobile home")
		bootinfo.nch_mobile_home = None
