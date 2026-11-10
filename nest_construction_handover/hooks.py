app_name        = "nest_construction_handover"
app_title       = "Nest Construction Handover"
app_publisher   = "NestERP / Syncflo"
app_description = "Two-signature stock handover dockets between main store, vans and site stores, built to work with no signal."
app_email       = "ops@syncflo.co.za"
app_license     = "Proprietary"
app_icon        = "octicon octicon-arrow-switch"

# Custom fields on Warehouse and User. See install.py. Re-applied on migrate so
# fields added later reach sites that already have the app.
after_install = "nest_construction_handover.install.after_install"
after_migrate = "nest_construction_handover.install.after_install"

# Installable as a phone app, and phones open the person's own field screen.
# See public/js/nch_pwa.js, public/js/nch_mobile.js and mobile.py.
app_include_js = [
	"/assets/nest_construction_handover/js/nch_pwa.js",
	"/assets/nest_construction_handover/js/nch_mobile.js",
]
web_include_js = ["/assets/nest_construction_handover/js/nch_pwa.js"]
boot_session = "nest_construction_handover.mobile.boot_session"
