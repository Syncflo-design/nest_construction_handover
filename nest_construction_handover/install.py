"""Custom fields this app needs on standard doctypes.

Kept in code rather than as fixtures so a fresh install on the next tenant
brings them along without anyone remembering to export anything.
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
		}
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
		}
	],
}


def after_install():
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
	frappe.db.commit()
