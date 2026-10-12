"""Custom fields this app needs on standard doctypes.

Kept in code rather than as fixtures so a fresh install on the next tenant
brings them along without anyone remembering to export anything. Run on
install and on every migrate, so a field added here reaches sites that
already have the app.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

CUSTOM_FIELDS = {
	"Warehouse": [
		{
			"fieldname": "handover_role",
			"label": "Handover Role",
			"fieldtype": "Select",
			"options": "\nMain Store\nVan\nSite Store",
			"insert_after": "warehouse_type",
			"description": (
				"Where this warehouse sits in the handover chain. Drives who may "
				"hand stock to whom. Leave blank for warehouses not used in the field."
			),
		},
		{
			"fieldname": "van_category",
			"label": "Van Category",
			"fieldtype": "Select",
			"options": "\nGoods In Transit\nTechnician Tools\nAssets\nVan Stock",
			"insert_after": "handover_role",
			"depends_on": "eval:doc.handover_role=='Van' && !doc.is_group",
			"description": "Which of the van's four warehouses this is.",
		},
	],
	"User": [
		{
			"fieldname": "custom_handover_pin",
			"label": "Handover PIN",
			"fieldtype": "Password",
			"insert_after": "username",
			"description": (
				"Four digits, used to sign stock handover dockets. This is a "
				"signature, not a login credential."
			),
		},
		{
			"fieldname": "custom_assigned_warehouse",
			"label": "Assigned Warehouse",
			"fieldtype": "Link",
			"options": "Warehouse",
			"insert_after": "bio",
			"description": (
				"The store, van or site this user works from on the Van & Site Stock screen. "
				"For a van, the van itself (the group), not one of its compartments."
			),
		},
	],
}


def after_install():
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
	frappe.db.commit()
